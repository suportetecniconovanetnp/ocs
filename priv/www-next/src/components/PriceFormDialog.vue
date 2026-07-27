<script setup lang="ts">
import { computed, ref, toRaw, watch } from 'vue';
import {
  emptyPrice,
  type PriceForm,
  type PriceAlterationForm,
  type ProductSpecKind,
} from '@/services/offeringMapper';
import type { PriceUnit } from '@/composables/useUnitOfMeasure';
import {
  allowedPriceUnits,
  defaultUnitFor,
  isAmountAllowed,
  isPeriodAllowed,
  isPlaAllowed,
  isPrefixTariffAllowed,
  isReserveOctetsAllowed,
  isReserveTimeAllowed,
  isRoamingTableAllowed,
} from '@/composables/useOfferingRules';

interface Props {
  alterations?: PriceAlterationForm[];
  productSpec?: ProductSpecKind;
}

const props = withDefaults(defineProps<Props>(), {
  alterations: () => [],
  productSpec: '' as ProductSpecKind,
});

const open = ref(false);
const editingIndex = ref<number | null>(null);
const showCharacteristics = ref(false);
const form = ref<PriceForm>(emptyPrice());

const emit = defineEmits<{ saved: [{ price: PriceForm; index: number | null }] }>();

const PRICE_TYPES = [
  { title: 'Recurring', value: 'recurring' },
  { title: 'One Time', value: 'one time' },
  { title: 'Usage', value: 'usage' },
  { title: 'Tariff', value: 'tariff' },
] as const;

const ALL_UNITS: { title: string; value: PriceUnit }[] = [
  { title: 'Bytes (b)', value: 'b' },
  { title: 'Cents (no UoM)', value: 'cents' },
  { title: 'Seconds (s)', value: 's' },
  { title: 'Messages (msg)', value: 'msg' },
];

const PERIODS = ['hourly', 'daily', 'weekly', 'monthly', 'yearly'];

const allowedUnits = computed(() => allowedPriceUnits(form.value.type, props.productSpec));
const unitItems = computed(() =>
  ALL_UNITS.map((u) => ({ ...u, props: { disabled: !allowedUnits.value.includes(u.value) } })),
);
const periodAllowed = computed(() => isPeriodAllowed(form.value.type));
const fixedMonthDayAllowed = computed(() => periodAllowed.value && form.value.period === 'monthly');
const plaAllowed = computed(() => isPlaAllowed(form.value.type));
const amountAllowed = computed(() => isAmountAllowed(form.value.type));
const reserveTimeAllowed = computed(() => isReserveTimeAllowed(form.value.unit));
const reserveOctetsAllowed = computed(() => isReserveOctetsAllowed(form.value.unit));
const prefixTariffAllowed = computed(() => isPrefixTariffAllowed(props.productSpec));
const roamingAllowed = computed(() => isRoamingTableAllowed(props.productSpec));

// Auto-correct invalid combos when type changes (matches legacy _checkRecurring).
watch(
  () => form.value.type,
  () => {
    form.value.unit = defaultUnitFor(allowedUnits.value, form.value.unit);
    if (!periodAllowed.value) form.value.period = '';
    if (!fixedMonthDayAllowed.value) form.value.monthDay = null;
    if (!plaAllowed.value) form.value.pla = '';
    if (!amountAllowed.value) {
      form.value.amount = null;
      form.value.currency = '';
    }
  },
);

watch(
  () => form.value.period,
  () => {
    if (!fixedMonthDayAllowed.value) form.value.monthDay = null;
  },
);

watch(
  () => form.value.unit,
  () => {
    if (!reserveTimeAllowed.value) form.value.reserveTime = '';
    if (!reserveOctetsAllowed.value) form.value.reserveOctets = '';
  },
);

const alterationItems = computed(() => [
  { title: '— None —', value: '' },
  ...props.alterations.map((a) => ({ title: a.name, value: a.name })),
]);

function show(price?: PriceForm, index: number | null = null) {
  editingIndex.value = index;
  form.value = price ? structuredClone(toRaw(price)) : emptyPrice();
  showCharacteristics.value = Boolean(
    form.value.prefixTariff ||
      form.value.roamingTable ||
      form.value.chargingKey ||
      form.value.callDirectionIn ||
      form.value.callDirectionOut ||
      form.value.fixedPriceBucket ||
      form.value.todStart ||
      form.value.reserveTime ||
      form.value.reserveOctets,
  );
  open.value = true;
}

function save() {
  emit('saved', { price: structuredClone(toRaw(form.value)), index: editingIndex.value });
  open.value = false;
}

defineExpose({ show });
</script>

<template>
  <v-dialog v-model="open" max-width="720" persistent scrollable>
    <v-card>
      <v-card-title>{{ editingIndex === null ? 'Add price' : 'Edit price' }}</v-card-title>
      <v-card-text style="max-height: 75vh">
        <div class="text-overline mb-2">General</div>
        <v-text-field v-model="form.name" label="Name" autofocus class="mb-3" />
        <v-text-field v-model="form.description" label="Description" class="mb-3" />
        <div class="d-flex ga-3 mb-3">
          <v-text-field v-model="form.startDate" label="Valid from" type="datetime-local" />
          <v-text-field v-model="form.endDate" label="Valid to" type="datetime-local" />
        </div>
        <div class="d-flex ga-3 mb-3">
          <v-select v-model="form.type" :items="PRICE_TYPES" label="Price type" clearable />
          <v-select
            v-model="form.period"
            :items="PERIODS"
            label="Recurring period"
            clearable
            :disabled="!periodAllowed"
            :hint="periodAllowed ? '' : 'Only for Recurring type'"
            persistent-hint
          />
        </div>
        <v-text-field
          v-if="fixedMonthDayAllowed"
          v-model.number="form.monthDay"
          type="number"
          min="1"
          max="31"
          label="Renewal day of month"
          hint="If the day does not exist in a month, billing runs on that month’s last day."
          persistent-hint
          class="mb-3"
        />
        <v-text-field
          v-model="form.pla"
          label="Pricing logic algorithm (URL)"
          placeholder="https://..."
          :disabled="!plaAllowed"
          :hint="plaAllowed ? '' : 'Only for Tariff type'"
          persistent-hint
          class="mb-3"
        />

        <v-divider class="mb-3" />
        <div class="text-overline mb-2">Unit &amp; amount</div>
        <div class="d-flex ga-3 mb-3">
          <v-select
            v-model="form.unit"
            :items="unitItems"
            item-title="title"
            item-value="value"
            label="Units"
            :hint="`Allowed: ${allowedUnits.join(', ')}`"
            persistent-hint
          />
          <v-text-field
            v-model="form.size"
            label="Unit size"
            placeholder="e.g. 1500, 5m, 1h"
            :disabled="form.unit === 'cents'"
          />
        </div>
        <div class="d-flex ga-3 mb-3">
          <v-text-field
            v-model.number="form.amount"
            type="number"
            step="0.01"
            label="Amount"
            :disabled="!amountAllowed"
            :hint="amountAllowed ? '' : 'Tariff prices are computed by the PLA'"
            persistent-hint
          />
          <v-text-field
            v-model="form.currency"
            label="Currency"
            placeholder="USD"
            maxlength="3"
            :disabled="!amountAllowed"
          />
        </div>

        <v-divider class="mb-3" />
        <v-select
          v-model="form.alterationName"
          :items="alterationItems"
          label="Alteration"
          hint="Bind a discount/surcharge defined in the Alterations tab"
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
            <v-checkbox
              v-model="form.fixedPriceBucket"
              label="Fixed Price Bucket"
              density="compact"
              hide-details
              class="mb-2"
            />

            <div class="text-caption text-medium-emphasis mb-1">Time of day range</div>
            <div class="d-flex ga-3 mb-3">
              <v-text-field v-model="form.todStart" label="Start time" type="time" />
              <v-text-field v-model="form.todEnd" label="End time" type="time" />
            </div>

            <div class="text-caption text-medium-emphasis mb-1">Call direction</div>
            <div class="d-flex ga-4 mb-3">
              <v-checkbox
                v-model="form.callDirectionIn"
                label="Incoming"
                density="compact"
                hide-details
              />
              <v-checkbox
                v-model="form.callDirectionOut"
                label="Outgoing"
                density="compact"
                hide-details
              />
            </div>

            <div class="d-flex ga-3 mb-3">
              <v-text-field
                v-model="form.reserveTime"
                label="RADIUS reserve time"
                placeholder="e.g. 60s, 5m"
                :disabled="!reserveTimeAllowed"
                :hint="reserveTimeAllowed ? '' : 'Only when units are Seconds'"
                persistent-hint
              />
              <v-text-field
                v-model="form.reserveOctets"
                label="RADIUS reserve data (bytes)"
                type="number"
                :disabled="!reserveOctetsAllowed"
                :hint="reserveOctetsAllowed ? '' : 'Only when units are Bytes'"
                persistent-hint
              />
            </div>

            <div class="d-flex ga-3 mb-3">
              <v-text-field
                v-model="form.prefixTariff"
                label="Prefix tariff table"
                :disabled="!prefixTariffAllowed"
                :hint="prefixTariffAllowed ? '' : 'Voice/SMS only'"
                persistent-hint
              />
              <v-text-field
                v-model="form.roamingTable"
                label="Roaming table"
                :disabled="!roamingAllowed"
                :hint="roamingAllowed ? '' : 'Voice/SMS only'"
                persistent-hint
              />
            </div>
            <v-text-field v-model="form.chargingKey" label="Charging key" type="number" />
          </div>
        </v-expand-transition>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">Cancel</v-btn>
        <v-btn color="primary" @click="save">{{ editingIndex === null ? 'Add price' : 'Save' }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
