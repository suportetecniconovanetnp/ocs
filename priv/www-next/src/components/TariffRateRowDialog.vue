<script setup lang="ts">
import { computed, ref } from 'vue';
import { charString } from '@/services';
import type { Characteristic, Resource } from '@/types/tmf';

/*
 * Add/edit dialog for a rate tariff row. Fields mirror the legacy
 * `sig-tariff-rate-add.js` / `sig-tariff-rate-update.js` — prefix,
 * description, rate. The rate value is stored as the operator types
 * it (a decimal string); SigScale treats rate values as signed
 * decimals with up to 6 places of precision (see ocs:millionths_in/1).
 *
 * The dialog is a pure form — the parent hooks up the save/cancel
 * events and does the actual POST/PATCH.
 */

const open = ref(false);
const editing = ref<Resource | null>(null);

const prefix = ref('');
const description = ref('');
const rate = ref('');

const emit = defineEmits<{
  save: [chars: Characteristic[], existing: Resource | null];
}>();

const isEdit = computed(() => editing.value != null);

function show(row?: Resource) {
  editing.value = row ?? null;
  prefix.value = charString(row ?? ({} as Resource), 'prefix') ?? '';
  description.value = charString(row ?? ({} as Resource), 'description') ?? '';
  rate.value = charString(row ?? ({} as Resource), 'rate') ?? '';
  open.value = true;
}

function submit() {
  const chars: Characteristic[] = [
    { name: 'prefix', value: prefix.value.trim() },
    { name: 'description', value: description.value.trim() },
    { name: 'rate', value: rate.value.trim() },
  ].filter((c) => c.value !== '');
  emit('save', chars, editing.value);
  open.value = false;
}

const canSave = computed(
  () => prefix.value.trim() !== '' && rate.value.trim() !== '',
);

defineExpose({ show });
</script>

<template>
  <v-dialog v-model="open" max-width="520" persistent>
    <v-card>
      <v-card-title>
        {{ isEdit ? 'Edit rate row' : 'Add rate row' }}
      </v-card-title>
      <v-card-text>
        <v-text-field
          v-model="prefix"
          label="Prefix"
          placeholder="e.g. 44, 55, 1800"
          :disabled="isEdit"
          :hint="isEdit ? 'Prefix cannot be changed after creation.' : 'Digits only — matched as a leading substring by the rating engine.'"
          persistent-hint
          class="mb-3"
        />
        <v-text-field
          v-model="description"
          label="Description"
          placeholder="Free-form label (e.g. “UK national”)"
          class="mb-3"
        />
        <v-text-field
          v-model="rate"
          label="Rate"
          placeholder="e.g. 0.50"
          hint="Decimal value per unit. Precision up to 6 places (backend uses millionths)."
          persistent-hint
        />
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
