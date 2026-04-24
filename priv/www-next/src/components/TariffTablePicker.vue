<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Resource } from '@/types/tmf';

/*
 * Table selector for the tariff viewers. Owns the dropdown, the
 * "new table" inline form, and the "delete this table" action.
 * Stays pure UI — all mutations go through the `createTable` and
 * `deleteTable` callbacks the parent view provides.
 */

interface Props {
  tables: Resource[];
  selectedTableId: string;
  loading: boolean;
  /** Pretty name for the kind — shown in dialog titles and labels. */
  kindLabel: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:selectedTableId': [id: string];
  'create-table': [payload: { name: string; description?: string }];
  'delete-table': [id: string];
  refresh: [];
}>();

const showAdd = ref(false);
const newName = ref('');
const newDescription = ref('');

const tableItems = computed(() =>
  props.tables.map((t) => ({
    title: t.description ? `${t.name}  ·  ${t.description}` : (t.name ?? t.id),
    value: t.id,
  })),
);

const selectedTable = computed<Resource | undefined>(() =>
  props.tables.find((t) => t.id === props.selectedTableId),
);

function startAdd() {
  newName.value = '';
  newDescription.value = '';
  showAdd.value = true;
}

function submitAdd() {
  const name = newName.value.trim();
  if (!name) return;
  emit('create-table', {
    name,
    description: newDescription.value.trim() || undefined,
  });
  showAdd.value = false;
}

function onSelectChange(value: unknown) {
  emit('update:selectedTableId', typeof value === 'string' ? value : '');
}
</script>

<template>
  <v-card class="mb-4">
    <v-card-text>
      <div class="d-flex align-center ga-3 flex-wrap">
        <v-select
          :model-value="selectedTableId"
          :items="tableItems"
          :label="`${kindLabel} table`"
          :loading="loading"
          :disabled="tables.length === 0"
          :hint="
            loading
              ? 'Loading tables…'
              : tables.length === 0
                ? `No ${kindLabel.toLowerCase()} tables yet — create one to start adding rows.`
                : `${tables.length} table${tables.length === 1 ? '' : 's'} available`
          "
          persistent-hint
          density="compact"
          style="min-width: 320px"
          @update:model-value="onSelectChange"
        />
        <v-spacer />
        <v-btn
          prepend-icon="mdi-refresh"
          variant="tonal"
          size="small"
          :disabled="loading"
          @click="emit('refresh')"
        >
          Refresh
        </v-btn>
        <v-btn
          prepend-icon="mdi-table-plus"
          color="primary"
          size="small"
          @click="startAdd"
        >
          New table
        </v-btn>
        <v-btn
          prepend-icon="mdi-table-remove"
          color="error"
          variant="text"
          size="small"
          :disabled="!selectedTable"
          @click="emit('delete-table', selectedTableId)"
        >
          Delete table
        </v-btn>
      </div>

      <v-expand-transition>
        <div v-if="showAdd" class="mt-4">
          <v-divider class="mb-3" />
          <div class="text-subtitle-2 mb-2">New {{ kindLabel.toLowerCase() }} table</div>
          <div class="d-flex ga-3 flex-wrap">
            <v-text-field
              v-model="newName"
              label="Name"
              placeholder="e.g. intl-rates"
              hint="Used as the lookup key by the rating engine. No spaces."
              persistent-hint
              density="compact"
              autofocus
              style="min-width: 260px"
            />
            <v-text-field
              v-model="newDescription"
              label="Description (optional)"
              density="compact"
              style="min-width: 300px"
            />
            <v-spacer />
            <v-btn variant="text" size="small" @click="showAdd = false">Cancel</v-btn>
            <v-btn
              color="primary"
              size="small"
              :disabled="!newName.trim()"
              @click="submitAdd"
            >
              Create
            </v-btn>
          </div>
        </div>
      </v-expand-transition>
    </v-card-text>
  </v-card>
</template>
