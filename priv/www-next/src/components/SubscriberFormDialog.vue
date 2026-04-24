<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { subscribersApi, catalogApi, productsApi, balanceApi } from '@/services';
import {
  buildServicePayload,
  buildProductPayload,
  buildCreditQuantity,
  emptySubscriberForm,
  parseSubscriber,
  LIFECYCLE_STATES,
  type SubscriberForm,
} from '@/services/subscriberMapper';

// Keep LIFECYCLE_STATES imported — the template derives lifecycleLabels
// from it in the <script setup> block.
import { useNotificationsStore } from '@/stores/notifications';
import { useAsyncResource } from '@/composables/useAsyncResource';
import type { Service, ProductOffering } from '@/types/tmf';

interface Props {
  subscriber?: Service | null;
}

const props = withDefaults(defineProps<Props>(), { subscriber: null });
const emit = defineEmits<{ saved: [Service] }>();

const open = ref(false);
const saving = ref(false);
const tab = ref<'product' | 'auth' | 'authz' | 'credit'>('product');
const showAkaPassword = ref(false);
const showPassword = ref(false);
const form = ref<SubscriberForm>(emptySubscriberForm());
const notifications = useNotificationsStore();

const isEdit = computed(() => Boolean(props.subscriber));

// Lazy-load the catalog when the dialog first opens so the Product Offering
// dropdown is populated without blocking the subscriber list.
const offerings = useAsyncResource<ProductOffering[]>(
  async () => {
    const list = await catalogApi.listOfferings(0, 99);
    return list.items;
  },
  false,
);

const offeringItems = computed(() => [
  { title: '— None (use existing product ID) —', value: '' },
  ...(offerings.data.value ?? []).map((o) => ({ title: o.name, value: o.id })),
]);

// Widen the readonly LIFECYCLE_STATES to string[] for the v-select items.
const lifecycleLabels = computed<string[]>(() => LIFECYCLE_STATES.map((l) => l.label));

watch(
  () => props.subscriber,
  (next) => {
    form.value = next ? parseSubscriber(next) : emptySubscriberForm();
  },
  { immediate: true },
);

function show() {
  form.value = props.subscriber ? parseSubscriber(props.subscriber) : emptySubscriberForm();
  tab.value = 'product';
  open.value = true;
  if (!offerings.data.value) void offerings.reload();
}

function validate(): string | null {
  if (!isEdit.value) {
    const hasOffering = !!form.value.product.offeringId;
    const hasExistingProduct = !!form.value.product.existingProductId;
    if (!hasOffering && !hasExistingProduct) {
      tab.value = 'product';
      return 'Pick a product offering or enter an existing product ID.';
    }
    if (!form.value.auth.generateIdentity && !form.value.auth.identity) {
      tab.value = 'auth';
      return 'Identity is required (or tick "Generate").';
    }
  }
  return null;
}


async function save() {
  const err = validate();
  if (err) {
    notifications.warning(err);
    return;
  }
  saving.value = true;
  try {
    let result: Service;

    if (isEdit.value) {
      // --- Update path: PATCH the service. If the user typed an amount on the
      // Credit tab, also fire a balance adjustment against the existing product.
      const payload = buildServicePayload(form.value, 'update');
      try {
        result = await subscribersApi.update(props.subscriber!.id, payload);
      } catch {
        notifications.error('Failed to update the subscriber.');
        return;
      }
      const productId = form.value.product.existingProductId || result.product || result.productId;
      const quantity = buildCreditQuantity(form.value.credit.amount, form.value.credit.units);
      if (form.value.credit.amount && !quantity) {
        notifications.warning(
          `Subscriber updated, but could not parse credit amount "${form.value.credit.amount}".`,
        );
      } else if (form.value.credit.amount && !productId) {
        notifications.warning(
          'Subscriber updated, but credit was skipped: no product associated. Top up from the Buckets view after attaching a product.',
        );
      } else if (quantity && productId) {
        try {
          await balanceApi.adjustment(productId, quantity);
          notifications.success(`Applied ${form.value.credit.amount} ${form.value.credit.units}.`);
        } catch {
          notifications.warning(
            `Subscriber updated, but applying credit failed. Try again from the Top-up button.`,
          );
        }
      }
    } else {
      // --- Create path: 3 sequential POSTs matching legacy sig-sub-add.
      // Each step is wrapped individually so a partial-success scenario
      // (e.g. service created, but balance topup failed) shows a precise
      // toast and the dialog stays open for the user to retry the failed step.
      if (!form.value.auth.generateIdentity && form.value.auth.identity) {
        const exists = await subscribersApi.exists(form.value.auth.identity);
        if (exists === true) {
          tab.value = 'auth';
          notifications.error(
            `Subscriber "${form.value.auth.identity}" already exists. Pick a different identity or edit the existing one.`,
          );
          return;
        }
        if (exists === null) {
          notifications.error(
            'Could not verify whether the identity is available. Aborting to avoid overwriting an existing subscriber.',
          );
          return;
        }
      }

      // 1. Service
      try {
        result = await subscribersApi.create(buildServicePayload(form.value, 'create'));
      } catch {
        notifications.error('Failed to create the subscriber service. Nothing was saved.');
        return;
      }

      // 2. Product (skip if the service is already bound to one)
      let productId = form.value.product.existingProductId || result.product || result.productId;
      if (!productId && form.value.product.offeringId) {
        try {
          const created = await productsApi.create(
            buildProductPayload(form.value.product.offeringId, result.id),
          );
          productId = created.id;
        } catch {
          notifications.error(
            `Subscriber "${result.id}" was created but the product offering could not be attached. Add it manually from the Catalog view.`,
          );
          emit('saved', result);
          open.value = false;
          return;
        }
      }

      // 3. Balance adjustment
      const quantity = buildCreditQuantity(form.value.credit.amount, form.value.credit.units);
      if (import.meta.env.DEV) {
        console.info('[ocs-subscriber] credit step:', {
          rawAmount: form.value.credit.amount,
          units: form.value.credit.units,
          quantity,
          productId,
          serviceId: result.id,
        });
      }
      if (form.value.credit.amount && !quantity) {
        notifications.warning(
          `Could not parse credit amount "${form.value.credit.amount}" — subscriber created but no credit applied.`,
        );
      } else if (form.value.credit.amount && !productId) {
        notifications.warning(
          'Subscriber created but credit was skipped: no product was associated. Add a balance later from the Buckets view.',
        );
      } else if (quantity && productId) {
        try {
          await balanceApi.adjustment(productId, quantity);
        } catch {
          notifications.warning(
            `Subscriber "${result.id}" and product "${productId}" created, but applying the initial credit failed. Add it manually from the Buckets view.`,
          );
          emit('saved', result);
          open.value = false;
          return;
        }
      }
    }

    notifications.success(isEdit.value ? 'Subscriber updated.' : 'Subscriber created.');
    emit('saved', result);
    open.value = false;
  } finally {
    saving.value = false;
  }
}

defineExpose({ show });
</script>

<template>
  <v-dialog v-model="open" max-width="760" persistent scrollable>
    <v-card>
      <v-card-title>
        {{ isEdit ? `Edit subscriber — ${subscriber?.id}` : 'Add subscriber' }}
      </v-card-title>

      <v-tabs v-model="tab" color="primary">
        <v-tab value="product">Product</v-tab>
        <v-tab value="auth">Authentication</v-tab>
        <v-tab value="authz">Authorization</v-tab>
        <v-tab value="credit">Credit</v-tab>
      </v-tabs>

      <v-card-text style="max-height: 75vh">
        <v-tabs-window v-model="tab">
          <!-- ================= PRODUCT ================= -->
          <v-tabs-window-item value="product">
            <v-select
              v-model="form.product.offeringId"
              :items="offeringItems"
              label="Product offering"
              :loading="offerings.loading.value"
              :disabled="isEdit || !!form.product.existingProductId"
              :hint="
                offerings.loading.value
                  ? 'Loading offerings…'
                  : form.product.existingProductId
                    ? 'Cleared because an existing product ID is set below'
                    : isEdit
                      ? 'Re-assigning offers is not supported from the edit dialog'
                      : 'Creates a new product bound to this subscriber on save'
              "
              persistent-hint
              class="mb-3"
            />
            <v-text-field
              v-model="form.product.existingProductId"
              label="Existing product ID (alternative)"
              :disabled="isEdit || !!form.product.offeringId"
              hint="Bind the service to a product that already exists. Leave empty to create a new one from the offering above."
              persistent-hint
              class="mb-3"
            />

            <v-divider class="mb-3" />

            <div class="d-flex ga-3 mb-3">
              <v-text-field
                v-model="form.product.startDate"
                label="Start date"
                type="datetime-local"
              />
              <v-text-field
                v-model="form.product.endDate"
                label="End date"
                type="datetime-local"
              />
            </div>

            <v-select
              v-model="form.product.lifecycleLabel"
              :items="lifecycleLabels"
              label="Lifecycle status"
            />
          </v-tabs-window-item>

          <!-- ================= AUTHENTICATION ================= -->
          <v-tabs-window-item value="auth">
            <v-text-field
              v-model="form.auth.identity"
              label="Identity"
              :disabled="form.auth.generateIdentity || isEdit"
              autofocus
              class="mb-1"
            />
            <v-checkbox
              v-if="!isEdit"
              v-model="form.auth.generateIdentity"
              label="Generate identity on the server"
              density="compact"
              hide-details
              class="mb-3"
            />
            <v-text-field
              v-model="form.auth.password"
              :type="showPassword ? 'text' : 'password'"
              label="Password"
              :disabled="form.auth.generatePassword"
              :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
              @click:append-inner="showPassword = !showPassword"
              class="mb-1"
            />
            <v-checkbox
              v-model="form.auth.generatePassword"
              label="Generate password on the server"
              density="compact"
              hide-details
              class="mb-3"
            />
            <v-divider class="mb-3" />
            <div class="text-subtitle-2 mb-2">EAP-AKA (optional)</div>
            <div class="d-flex ga-3">
              <v-text-field
                v-model="form.auth.akaK"
                label="K (128-bit key, hex)"
                placeholder="0123456789abcdef0123456789abcdef"
                hint="Only used when the subscriber authenticates via EAP-AKA."
                persistent-hint
              />
              <v-text-field
                v-model="form.auth.akaOpc"
                :type="showAkaPassword ? 'text' : 'password'"
                label="OPc"
                :append-inner-icon="showAkaPassword ? 'mdi-eye-off' : 'mdi-eye'"
                @click:append-inner="showAkaPassword = !showAkaPassword"
              />
            </div>
          </v-tabs-window-item>

          <!-- ================= AUTHORIZATION ================= -->
          <v-tabs-window-item value="authz">
            <div class="d-flex ga-3 mb-3">
              <v-text-field
                v-model="form.authz.sessionInterval"
                label="Session interval"
                placeholder="e.g. 30m, 2h, 1d"
                hint="Suffix s/m/h/d (default seconds). Sent as acctSessionInterval."
                persistent-hint
              />
              <v-text-field
                v-model="form.authz.sessionTimeout"
                label="Session timeout"
                placeholder="e.g. 1h"
                hint="Suffix s/m/h/d (default seconds). Sent as sessionTimeout."
                persistent-hint
              />
            </div>
            <v-text-field
              v-model="form.authz.className"
              label="Class"
              hint="Free-form RADIUS Class AVP"
              persistent-hint
              class="mb-3"
            />
            <v-switch
              v-model="form.authz.enabled"
              color="primary"
              label="Service enabled"
              density="compact"
              hide-details
              class="mb-2"
            />
            <v-switch
              v-model="form.authz.multisession"
              color="primary"
              label="Allow multi-session"
              density="compact"
              hide-details
            />
          </v-tabs-window-item>

          <!-- ================= CREDIT ================= -->
          <v-tabs-window-item value="credit">
            <p class="text-caption text-medium-emphasis mb-3">
              Initial balance to apply after the subscriber is created. Leave empty to skip.
              Always applied to the product assigned in the "Product" tab.
            </p>
            <div class="d-flex ga-3 mb-3">
              <v-text-field
                v-model="form.credit.amount"
                label="Amount"
                placeholder="e.g. 500, 1g, 30s"
                hint="Suffix k/m/g for octets, m/h/d for seconds. Cents is a plain number."
                persistent-hint
              />
              <v-select
                v-model="form.credit.units"
                :items="[
                  { title: 'Cents', value: 'cents' },
                  { title: 'Octets (bytes)', value: 'octets' },
                  { title: 'Seconds', value: 'seconds' },
                ]"
                label="Units"
              />
            </div>
          </v-tabs-window-item>
        </v-tabs-window>
      </v-card-text>

      <v-divider />
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="saving" @click="open = false">Cancel</v-btn>
        <v-btn color="primary" :loading="saving" @click="save">
          {{ isEdit ? 'Save' : 'Create' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
