<script setup lang="ts">
import { computed, ref, toRaw, watch } from 'vue';
import {
  emptyAlteration,
  type PriceAlterationForm,
  type ProductSpecKind,
} from '@/services/offeringMapper';
import type { PriceUnit } from '@/composables/useUnitOfMeasure';
import {
  allowedAlterationUnits,
  defaultUnitFor,
  isAmountAllowed,
  isPeriodAllowed,
} from '@/composables/useOfferingRules';

interface Props {
  productSpec?: ProductSpecKind;
}

const props = withDefaults(defineProps<Props>(), { productSpec: '' as ProductSpecKind });

const open = ref(false);
const editingIndex = ref<number | null>(null);
const form = ref<PriceAlterationForm>(emptyAlteration());

const emit = defineEmits<{
  saved: [{ alteration: PriceAlterationForm; index: number | null }];
}>();

// Alterations only support these three price types in the legacy UI.
const PRICE_TYPES = [
  { title: 'Recurring', value: 'recurring' },
  { title: 'One Time', value: 'one time' },
  { title: 'Usage', value: 'usage' },
] as const;

const ALL_UNITS: { title: string; value: PriceUnit }[] = [
  { title: 'Bytes (b)', value: 'b' },
  { title: 'Cents (no UoM)', value: 'cents' },
  { title: 'Seconds (s)', value: 's' },
  { title: 'Messages (msg)', value: 'msg' },
];

const PERIODS = ['hourly', 'daily', 'weekly', 'monthly', 'yearly'];

const allowedUnits = computed(() => allowedAlterationUnits(form.value.type, props.productSpec));
const unitItems = computed(() =>
  ALL_UNITS.map((u) => ({ ...u, props: { disabled: !allowedUnits.value.includes(u.value) } })),
);
const periodAllowed = computed(() => isPeriodAllowed(form.value.type));
const fixedMonthDayAllowed = computed(() => periodAllowed.value && form.value.period === 'monthly');
const amountAllowed = computed(() => isAmountAllowed(form.value.type));

watch(
  () => form.value.type,
  () => {
    form.value.unit = defaultUnitFor(allowedUnits.value, form.value.unit);
    if (!periodAllowed.value) form.value.period = '';
    if (!fixedMonthDayAllowed.value) form.value.monthDay = null;
  },
);

watch(
  () => form.value.period,
  () => {
    if (!fixedMonthDayAllowed.value) form.value.monthDay = null;
  },
);

function show(alteration?: PriceAlterationForm, index: number | null = null) {
  editingIndex.value = index;
  form.value = alteration ? structuredClone(toRaw(alteration)) : emptyAlteration();
  open.value = true;
}

function save() {
  if (!form.value.name) return;
  emit('saved', {
    alteration: structuredClone(toRaw(form.value)),
    index: editingIndex.value,
  });
  open.value = false;
}

defineExpose({ show });
</script>

<template>
  <v-dialog v-model="open" max-width="640" persistent scrollable>
    <v-card>
      <v-card-title>{{ editingIndex === null ? 'Add alteration' : 'Edit alteration' }}</v-card-title>
      <v-card-text style="max-height: 70vh">
        <v-text-field v-model="form.name" label="Name" autofocus class="mb-3" />
        <v-text-field v-model="form.description" label="Description" class="mb-3" />
        <div class="d-flex ga-3 mb-3">
          <v-text-field v-model="form.startDate" label="Start date" type="datetime-local" />
          <v-text-field v-model="form.endDate" label="End date" type="datetime-local" />
        </div>
        <div class="d-flex ga-3 mb-3">
          <v-select v-model="form.type" :items="PRICE_TYPES" label="Price type" clearable />
          <v-select
            v-model="form.period"
            :items="PERIODS"
            label="Period"
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
          <v-text-field v-model="form.size" label="Size" :disabled="form.unit === 'cents'" />
        </div>
        <div class="d-flex ga-3">
          <v-text-field
            v-model.number="form.amount"
            type="number"
            step="0.01"
            label="Amount"
            :disabled="!amountAllowed"
          />
          <v-text-field
            v-model="form.currency"
            label="Currency"
            maxlength="3"
            :disabled="!amountAllowed"
          />
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">Cancel</v-btn>
        <v-btn color="primary" :disabled="!form.name" @click="save">
          {{ editingIndex === null ? 'Add' : 'Save' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
