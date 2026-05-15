<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { catalogApi } from '@/services';
import {
  buildOfferingPayload,
  emptyOffering,
  emptyPrice,
  emptyAlteration,
  parseOffering,
  type OfferingForm,
  type PriceForm,
  type PriceAlterationForm,
} from '@/services/offeringMapper';
import { useNotificationsStore } from '@/stores/notifications';
import {
  isReserveSessionTimeAllowed,
  isReserveSessionOctetsAllowed,
} from '@/composables/useOfferingRules';
import PriceFormDialog from './PriceFormDialog.vue';
import AlterationFormDialog from './AlterationFormDialog.vue';
import ConfirmDialog from './ConfirmDialog.vue';
import type { ProductOffering } from '@/types/tmf';

interface Props {
  offering?: ProductOffering | null;
}

const props = withDefaults(defineProps<Props>(), { offering: null });
const emit = defineEmits<{ saved: [ProductOffering] }>();

const open = ref(false);
const saving = ref(false);
const tab = ref<'offering' | 'prices' | 'alterations'>('offering');
const showCharacteristics = ref(false);
const form = ref<OfferingForm>(emptyOffering());
const priceDialog = ref<InstanceType<typeof PriceFormDialog> | null>(null);
const alterationDialog = ref<InstanceType<typeof AlterationFormDialog> | null>(null);
const confirmDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null);
const notifications = useNotificationsStore();
const pendingDelete = ref<{ kind: 'price' | 'alteration'; index: number } | null>(null);

const PRODUCT_SPECS = [
  { title: '— None —', value: '' },
  { title: 'Prepaid Data', value: 'data' },
  { title: 'Prepaid Voice', value: 'voice' },
  { title: 'Prepaid SMS', value: 'sms' },
];

const LIFECYCLE = [
  'In Study',
  'In Design',
  'In Test',
  'Active',
  'Rejected',
  'Launched',
  'Retired',
  'Obsolete',
];

const reserveTimeAllowed = computed(() => isReserveSessionTimeAllowed(form.value.general.productSpec));
const reserveOctetsAllowed = computed(() =>
  isReserveSessionOctetsAllowed(form.value.general.productSpec),
);

// Mirror legacy _checkProductSpec: clear inapplicable session-level chars
// when the product spec changes so stale values don't get serialized.
watch(
  () => form.value.general.productSpec,
  () => {
    if (!reserveTimeAllowed.value) form.value.characteristics.reserveSessionTime = '';
    if (!reserveOctetsAllowed.value) form.value.characteristics.reserveSessionOctets = '';
  },
);

watch(
  () => props.offering,
  (next) => {
    form.value = next ? parseOffering(next) : emptyOffering();
  },
  { immediate: true },
);

function show() {
  form.value = props.offering ? parseOffering(props.offering) : emptyOffering();
  tab.value = 'offering';
  open.value = true;
}

/* Prices */
function addPrice() {
  priceDialog.value?.show(emptyPrice(), null);
}

function editPrice(index: number) {
  priceDialog.value?.show(form.value.prices[index], index);
}

async function removePrice(index: number) {
  pendingDelete.value = { kind: 'price', index };
  const ok = await confirmDialog.value?.ask();
  if (ok) form.value.prices.splice(index, 1);
  pendingDelete.value = null;
}

function onPriceSaved({ price, index }: { price: PriceForm; index: number | null }) {
  if (index === null) form.value.prices.push(price);
  else form.value.prices.splice(index, 1, price);
}

/* Alterations */
function addAlteration() {
  alterationDialog.value?.show(emptyAlteration(), null);
}

function editAlteration(index: number) {
  alterationDialog.value?.show(form.value.alterations[index], index);
}

async function removeAlteration(index: number) {
  pendingDelete.value = { kind: 'alteration', index };
  const ok = await confirmDialog.value?.ask();
  if (ok) {
    const removed = form.value.alterations[index];
    form.value.alterations.splice(index, 1);
    // unbind from any price referencing this alteration
    if (removed) {
      for (const p of form.value.prices) {
        if (p.alterationName === removed.name) p.alterationName = '';
      }
    }
  }
  pendingDelete.value = null;
}

function onAlterationSaved({
  alteration,
  index,
}: {
  alteration: PriceAlterationForm;
  index: number | null;
}) {
  if (index === null) {
    form.value.alterations.push(alteration);
  } else {
    const old = form.value.alterations[index];
    form.value.alterations.splice(index, 1, alteration);
    // if name changed, update bindings
    if (old && old.name !== alteration.name) {
      for (const p of form.value.prices) {
        if (p.alterationName === old.name) p.alterationName = alteration.name;
      }
    }
  }
}

/* Submit */
async function save() {
  if (!form.value.general.name) {
    notifications.warning('Offering name is required.');
    tab.value = 'offering';
    return;
  }
  saving.value = true;
  try {
    const payload = buildOfferingPayload(form.value);
    const result = props.offering
      ? await catalogApi.updateOffering(props.offering, payload)
      : await catalogApi.createOffering(payload);
    notifications.success(props.offering ? 'Offering updated.' : 'Offering created.');
    emit('saved', result);
    open.value = false;
  } finally {
    saving.value = false;
  }
}

defineExpose({ show });
</script>

<template>
  <v-dialog v-model="open" max-width="900" persistent scrollable>
    <v-card>
      <v-card-title>{{ offering ? `Edit offering — ${offering.name}` : 'Add offering' }}</v-card-title>

      <v-tabs v-model="tab" color="primary">
        <v-tab value="offering">Offering</v-tab>
        <v-tab value="prices">
          Prices
          <v-badge v-if="form.prices.length" :content="form.prices.length" inline class="ml-2" />
        </v-tab>
        <v-tab value="alterations">
          Alterations
          <v-badge
            v-if="form.alterations.length"
            :content="form.alterations.length"
            inline
            class="ml-2"
          />
        </v-tab>
      </v-tabs>

      <v-card-text style="max-height: 70vh">
        <v-tabs-window v-model="tab">
          <!-- ============================== OFFERING ============================== -->
          <v-tabs-window-item value="offering">
            <v-text-field
              v-model="form.general.name"
              label="Name"
              :disabled="!!offering"
              autofocus
              class="mb-3"
            />
            <v-text-field v-model="form.general.description" label="Description" class="mb-3" />
            <div class="d-flex ga-3 mb-3">
              <v-select
                v-model="form.general.productSpec"
                :items="PRODUCT_SPECS"
                label="Product specification"
              />
              <v-select v-model="form.general.lifecycleStatus" :items="LIFECYCLE" label="Status" />
            </div>
            <div class="d-flex ga-3 mb-3">
              <v-text-field v-model="form.general.startDate" label="Start date" type="datetime-local" />
              <v-text-field v-model="form.general.endDate" label="End date" type="datetime-local" />
            </div>

            <v-divider class="mb-3" />
            <v-switch
              v-model="form.general.isBundle"
              color="primary"
              label="This is a bundle"
              density="compact"
              hide-details
              class="mb-2"
            />
            <v-combobox
              v-if="form.general.isBundle"
              v-model="form.general.bundledIds"
              label="Bundled offering IDs (Enter to add)"
              chips
              clearable
              multiple
              hint="Type each offering ID and press Enter"
              persistent-hint
              class="mb-3"
            />

            <v-divider class="mb-3" />
            <div class="d-flex align-center mb-2">
              <div class="text-overline">Characteristics</div>
              <v-spacer />
              <v-btn
                size="x-small"
                variant="text"
                :prepend-icon="showCharacteristics ? 'mdi-chevron-up' : 'mdi-chevron-down'"
                @click="showCharacteristics = !showCharacteristics"
              >
                {{ showCharacteristics ? 'Hide' : 'Show' }}
              </v-btn>
            </div>
            <v-expand-transition>
              <div v-show="showCharacteristics">
                <div class="d-flex ga-3 mb-3">
                  <v-text-field
                    v-model="form.characteristics.reserveSessionTime"
                    label="RADIUS Reserve Session Time"
                    placeholder="e.g. 60s, 5m"
                    :disabled="!reserveTimeAllowed"
                    :hint="reserveTimeAllowed ? 'Suffix s/m (default seconds)' : 'Not applicable to SMS'"
                    persistent-hint
                  />
                  <v-text-field
                    v-model="form.characteristics.reserveSessionOctets"
                    label="RADIUS Reserve Session Bytes"
                    placeholder="e.g. 1024, 1m"
                    :disabled="!reserveOctetsAllowed"
                    :hint="reserveOctetsAllowed ? 'Suffix b/k/m/g (default bytes)' : 'Data only'"
                    persistent-hint
                  />
                </div>
                <v-text-field
                  v-model="form.characteristics.redirectAddress"
                  label="Redirect Server"
                  hint="IPv4/IPv6, http URL, or sip URI"
                  persistent-hint
                  class="mb-3"
                />
                <v-text-field
                  v-model="form.characteristics.policyTable"
                  label="Policy Table"
                  hint="Name of a Policy table of rules to install/activate on PCEF"
                  persistent-hint
                />
              </div>
            </v-expand-transition>
          </v-tabs-window-item>

          <!-- ============================== PRICES ============================== -->
          <v-tabs-window-item value="prices">
            <div class="d-flex align-center mb-3">
              <span class="text-body-2 text-medium-emphasis">
                {{ form.prices.length }} price{{ form.prices.length === 1 ? '' : 's' }} configured
              </span>
              <v-spacer />
              <v-btn color="primary" prepend-icon="mdi-plus" size="small" @click="addPrice">
                Add price
              </v-btn>
            </div>
            <v-table v-if="form.prices.length" density="compact">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Unit</th>
                  <th class="text-end">Amount</th>
                  <th>Period</th>
                  <th>Alteration</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(p, i) in form.prices" :key="i">
                  <td>{{ p.name }}</td>
                  <td>
                    <v-chip size="x-small">{{ p.type || '—' }}</v-chip>
                  </td>
                  <td>{{ p.unit === 'cents' ? '—' : `${p.size} ${p.unit}` }}</td>
                  <td class="text-end">
                    <code v-if="p.amount != null">{{ p.amount }} {{ p.currency }}</code>
                    <span v-else>—</span>
                  </td>
                  <td>{{ p.period || '—' }}</td>
                  <td>
                    <span v-if="p.alterationName" class="text-caption">{{ p.alterationName }}</span>
                    <span v-else class="text-caption text-medium-emphasis">—</span>
                  </td>
                  <td class="text-end">
                    <v-btn icon="mdi-pencil" variant="text" size="small" @click="editPrice(i)" />
                    <v-btn
                      icon="mdi-delete"
                      variant="text"
                      size="small"
                      color="error"
                      @click="removePrice(i)"
                    />
                  </td>
                </tr>
              </tbody>
            </v-table>
            <div v-else class="text-center pa-6 text-medium-emphasis">
              No prices yet. Click "Add price" above.
            </div>
          </v-tabs-window-item>

          <!-- ============================== ALTERATIONS ============================== -->
          <v-tabs-window-item value="alterations">
            <p class="text-caption text-medium-emphasis mb-3">
              Reusable price alterations (discounts, surcharges). Bind one to any price in the
              Prices tab.
            </p>
            <div class="d-flex align-center mb-3">
              <span class="text-body-2 text-medium-emphasis">
                {{ form.alterations.length }} alteration{{ form.alterations.length === 1 ? '' : 's' }}
              </span>
              <v-spacer />
              <v-btn color="primary" prepend-icon="mdi-plus" size="small" @click="addAlteration">
                Add alteration
              </v-btn>
            </div>
            <v-table v-if="form.alterations.length" density="compact">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Unit</th>
                  <th class="text-end">Amount</th>
                  <th>Period</th>
                  <th>Bound to</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(a, i) in form.alterations" :key="i">
                  <td>{{ a.name }}</td>
                  <td>
                    <v-chip size="x-small">{{ a.type || '—' }}</v-chip>
                  </td>
                  <td>{{ a.unit === 'cents' ? '—' : `${a.size} ${a.unit}` }}</td>
                  <td class="text-end">
                    <code v-if="a.amount != null">{{ a.amount }} {{ a.currency }}</code>
                    <span v-else>—</span>
                  </td>
                  <td>{{ a.period || '—' }}</td>
                  <td>
                    <span class="text-caption">
                      {{
                        form.prices.filter((p) => p.alterationName === a.name).map((p) => p.name).join(', ') || '—'
                      }}
                    </span>
                  </td>
                  <td class="text-end">
                    <v-btn icon="mdi-pencil" variant="text" size="small" @click="editAlteration(i)" />
                    <v-btn
                      icon="mdi-delete"
                      variant="text"
                      size="small"
                      color="error"
                      @click="removeAlteration(i)"
                    />
                  </td>
                </tr>
              </tbody>
            </v-table>
            <div v-else class="text-center pa-6 text-medium-emphasis">
              No alterations yet. Add one and bind it to a price.
            </div>
          </v-tabs-window-item>
        </v-tabs-window>
      </v-card-text>

      <v-divider />
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="saving" @click="open = false">Cancel</v-btn>
        <v-btn color="primary" :loading="saving" @click="save">
          {{ offering ? 'Save' : 'Create' }}
        </v-btn>
      </v-card-actions>
    </v-card>

    <PriceFormDialog
      ref="priceDialog"
      :alterations="form.alterations"
      :product-spec="form.general.productSpec"
      @saved="onPriceSaved"
    />
    <AlterationFormDialog
      ref="alterationDialog"
      :product-spec="form.general.productSpec"
      @saved="onAlterationSaved"
    />
    <ConfirmDialog
      ref="confirmDialog"
      :title="`Remove ${pendingDelete?.kind ?? 'item'}`"
      :message="`Remove this ${pendingDelete?.kind ?? 'item'} from the offering?`"
      confirm-text="Remove"
    />
  </v-dialog>
</template>
