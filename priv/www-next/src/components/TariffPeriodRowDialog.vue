<script setup lang="ts">
import { computed, ref } from 'vue';
import { charString } from '@/services';
import type { Characteristic, Resource } from '@/types/tmf';

/*
 * Add/edit dialog for a period-tariff row. Ports the field set from
 * `sig-tariff-period-add.js` / `sig-tariff-period-update.js` —
 * prefix, description, plus the two-tier (initial / additional) time
 * charge model: a session is first billed `rateInitial` per
 * `periodInitial` seconds, then `rateAdditional` per
 * `periodAdditional` seconds for the rest of its duration.
 */

const open = ref(false);
const editing = ref<Resource | null>(null);

const prefix = ref('');
const description = ref('');
const periodInitial = ref('');
const rateInitial = ref('');
const periodAdditional = ref('');
const rateAdditional = ref('');

const emit = defineEmits<{
  save: [chars: Characteristic[], existing: Resource | null];
}>();

const isEdit = computed(() => editing.value != null);

function show(row?: Resource) {
  editing.value = row ?? null;
  const src = row ?? ({} as Resource);
  prefix.value = charString(src, 'prefix') ?? '';
  description.value = charString(src, 'description') ?? '';
  periodInitial.value = charString(src, 'periodInitial') ?? '';
  rateInitial.value = charString(src, 'rateInitial') ?? '';
  periodAdditional.value = charString(src, 'periodAdditional') ?? '';
  rateAdditional.value = charString(src, 'rateAdditional') ?? '';
  open.value = true;
}

/**
 * Parse the period-seconds fields as integers. SigScale
 * (ocs.erl:1937-1943 and :1952-1957) pattern-matches `is_integer'
 * strictly on periodInitial and periodAdditional — so they must
 * arrive in the JSON as unquoted numbers, never strings, or the
 * decoder throws `missing_char' which surfaces as
 * 400 "A mandatory resource characteristic was missing".
 *
 * rateInitial / rateAdditional are tolerant (is_list | is_integer
 * | is_float) and we keep sending them as strings so decimals like
 * "0.05" survive without floating-point surprises.
 */
function asInt(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : undefined;
}

function submit() {
  const entries: Characteristic[] = [];
  if (prefix.value.trim()) entries.push({ name: 'prefix', value: prefix.value.trim() });
  if (description.value.trim()) entries.push({ name: 'description', value: description.value.trim() });
  const pInitial = asInt(periodInitial.value);
  if (pInitial !== undefined) entries.push({ name: 'periodInitial', value: pInitial });
  if (rateInitial.value.trim()) entries.push({ name: 'rateInitial', value: rateInitial.value.trim() });
  const pAdditional = asInt(periodAdditional.value);
  if (pAdditional !== undefined) entries.push({ name: 'periodAdditional', value: pAdditional });
  if (rateAdditional.value.trim()) entries.push({ name: 'rateAdditional', value: rateAdditional.value.trim() });
  emit('save', entries, editing.value);
  open.value = false;
}

const canSave = computed(
  () =>
    prefix.value.trim() !== '' &&
    periodInitial.value.trim() !== '' &&
    rateInitial.value.trim() !== '',
);

defineExpose({ show });
</script>

<template>
  <v-dialog v-model="open" max-width="640" persistent>
    <v-card>
      <v-card-title>
        {{ isEdit ? 'Edit period row' : 'Add period row' }}
      </v-card-title>
      <v-card-text>
        <v-text-field
          v-model="prefix"
          label="Prefix"
          placeholder="e.g. 44, 1800"
          :disabled="isEdit"
          :hint="isEdit ? 'Prefix cannot be changed after creation.' : 'Digits only — matched as a leading substring by the rating engine.'"
          persistent-hint
          class="mb-3"
        />
        <v-text-field
          v-model="description"
          label="Description"
          class="mb-4"
        />

        <div class="text-subtitle-2 mb-2">Initial period</div>
        <div class="text-caption text-medium-emphasis mb-2">
          Charge <code>rateInitial</code> for the first <code>periodInitial</code> seconds of the session.
        </div>
        <div class="d-flex ga-3 mb-4">
          <v-text-field
            v-model="periodInitial"
            label="Duration (seconds)"
            placeholder="60"
            type="number"
            hint="Integer, minimum 1."
            persistent-hint
          />
          <v-text-field
            v-model="rateInitial"
            label="Rate"
            placeholder="0.10"
            hint="Decimal value for the initial block."
            persistent-hint
          />
        </div>

        <div class="text-subtitle-2 mb-2">Additional period</div>
        <div class="text-caption text-medium-emphasis mb-2">
          After the initial block, charge <code>rateAdditional</code> per <code>periodAdditional</code> seconds.
        </div>
        <div class="d-flex ga-3">
          <v-text-field
            v-model="periodAdditional"
            label="Duration (seconds)"
            placeholder="30"
            type="number"
            hint="Integer. Leave empty to stop billing after the initial block."
            persistent-hint
          />
          <v-text-field
            v-model="rateAdditional"
            label="Rate"
            placeholder="0.05"
            hint="Decimal value per additional block."
            persistent-hint
          />
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">Cancel</v-btn>
        <v-btn color="primary" :disabled="!canSave" @click="submit">
          {{ isEdit ? 'Save' : 'Add' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
