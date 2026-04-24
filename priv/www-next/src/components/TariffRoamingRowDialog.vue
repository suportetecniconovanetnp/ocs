<script setup lang="ts">
import { computed, ref } from 'vue';
import { charString } from '@/services';
import type { Characteristic, Resource } from '@/types/tmf';

/*
 * Add/edit dialog for a roaming tariff row. Ports the field set
 * from sig-tariff-roaming-add.js / sig-tariff-roaming-update.js.
 *
 * The `tariff` field is a TABLE-NAME PREFIX that the rating engine
 * combines with the tariff name from the subscriber's Product
 * Offering Price at authorization time. Worked example (from the
 * legacy dialog hint): roaming-prefix=310 → tariff="usa-", offering
 * price tariff name="rates" → final lookup key "usa-rates".
 */

const open = ref(false);
const editing = ref<Resource | null>(null);

const prefix = ref('');
const description = ref('');
const tariff = ref('');

const emit = defineEmits<{
  save: [chars: Characteristic[], existing: Resource | null];
}>();

const isEdit = computed(() => editing.value != null);

function show(row?: Resource) {
  editing.value = row ?? null;
  const src = row ?? ({} as Resource);
  prefix.value = charString(src, 'prefix') ?? '';
  description.value = charString(src, 'description') ?? '';
  tariff.value = charString(src, 'tariff') ?? '';
  open.value = true;
}

function submit() {
  const entries: Characteristic[] = [
    { name: 'prefix', value: prefix.value.trim() },
    { name: 'description', value: description.value.trim() },
    { name: 'tariff', value: tariff.value.trim() },
  ].filter((c) => c.value !== '');
  emit('save', entries, editing.value);
  open.value = false;
}

const canSave = computed(
  () => prefix.value.trim() !== '' && tariff.value.trim() !== '',
);

defineExpose({ show });
</script>

<template>
  <v-dialog v-model="open" max-width="560" persistent>
    <v-card>
      <v-card-title>
        {{ isEdit ? 'Edit roaming row' : 'Add roaming row' }}
      </v-card-title>
      <v-card-text>
        <v-text-field
          v-model="prefix"
          label="Prefix"
          placeholder="e.g. 310 (USA MCC)"
          :disabled="isEdit"
          :hint="isEdit ? 'Prefix cannot be changed after creation.' : 'Visited-network MCCMNC prefix — matched as a leading substring.'"
          persistent-hint
          class="mb-3"
        />
        <v-text-field
          v-model="description"
          label="Description"
          placeholder="Free-form label (e.g. “USA”)"
          class="mb-3"
        />
        <v-text-field
          v-model="tariff"
          label="Tariff table prefix"
          placeholder="e.g. usa-"
          hint="Combined at session time with the tariff name from the subscriber's offering price, to yield the lookup key (e.g. `usa-` + `rates` = `usa-rates`)."
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
