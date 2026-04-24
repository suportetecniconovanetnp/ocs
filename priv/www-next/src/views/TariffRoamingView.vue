<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useTariffs } from '@/composables/useTariffs';
import { charString } from '@/services';
import TariffTablePicker from '@/components/TariffTablePicker.vue';
import TariffRoamingRowDialog from '@/components/TariffRoamingRowDialog.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import type { Characteristic, Resource } from '@/types/tmf';

/*
 * Roaming tariffs — visited-network (MCCMNC) prefix → tariff-table
 * prefix lookup. The rating engine combines a matched `tariff` value
 * with the tariff name from the subscriber's offering price to pick
 * the final rate/period table during session authorization.
 *
 * Ports `sig-roaming-table-list.js` + `sig-tariff-roaming-list.js`.
 */

const t = useTariffs('roaming');
const rowDialog = ref<InstanceType<typeof TariffRoamingRowDialog> | null>(null);
const tableDeleteConfirm = ref<InstanceType<typeof ConfirmDialog> | null>(null);
const rowDeleteConfirm = ref<InstanceType<typeof ConfirmDialog> | null>(null);
const pendingTableDeleteId = ref('');
const pendingRowDelete = ref<Resource | null>(null);

onMounted(() => void t.loadTables());

const tableDeleteMessage = computed(() => {
  const table = t.tables.value.find((x) => x.id === pendingTableDeleteId.value);
  if (!table) return '';
  return `Permanently delete the roaming table "${table.name}" and every row inside it? Subscribers currently roaming on networks matched by this table will fall through to any remaining matches — or fail rating if none remain.`;
});

const rowDeleteMessage = computed(() => {
  const row = pendingRowDelete.value;
  if (!row) return '';
  const prefix = charString(row, 'prefix') ?? row.id;
  return `Permanently delete the roaming row with prefix "${prefix}"? Roaming subscribers whose visited network matches this prefix will stop being routed through the "${charString(row, 'tariff') ?? '?'}" tariff.`;
});

const headers = [
  { title: 'Prefix (MCCMNC)', key: 'prefix' },
  { title: 'Description', key: 'description' },
  { title: 'Tariff table prefix', key: 'tariff' },
  { title: '', key: 'actions', sortable: false, align: 'end' as const, width: 120 },
];

const displayRows = computed(() =>
  t.rows.value.map((r) => ({
    id: r.id,
    prefix: charString(r, 'prefix') ?? '—',
    description: charString(r, 'description') ?? '—',
    tariff: charString(r, 'tariff') ?? '—',
    raw: r,
  })),
);

/* ------ table-level actions ------ */

function handleCreateTable(payload: { name: string; description?: string }) {
  void t.createTable(payload);
}

async function handleDeleteTable(id: string) {
  pendingTableDeleteId.value = id;
  const ok = await tableDeleteConfirm.value?.ask();
  pendingTableDeleteId.value = '';
  if (!ok) return;
  void t.deleteTable(id);
}

/* ------ row-level actions ------ */

function addRow() {
  rowDialog.value?.show();
}

function editRow(row: Resource) {
  rowDialog.value?.show(row);
}

async function saveRow(chars: Characteristic[], existing: Resource | null) {
  if (existing) {
    await t.updateRow(existing, chars);
  } else {
    await t.createRow({ characteristics: chars });
  }
}

async function askDeleteRow(row: Resource) {
  pendingRowDelete.value = row;
  const ok = await rowDeleteConfirm.value?.ask();
  pendingRowDelete.value = null;
  if (!ok) return;
  void t.deleteRow(row);
}
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <h1 class="text-h5 font-weight-medium">Roaming tariffs</h1>
      <v-spacer />
      <v-btn
        color="primary"
        prepend-icon="mdi-plus"
        :disabled="!t.selectedTable.value"
        @click="addRow"
      >
        Add row
      </v-btn>
    </div>

    <TariffTablePicker
      :tables="t.tables.value"
      :selected-table-id="t.selectedTableId.value"
      :loading="t.tablesLoading.value"
      kind-label="Roaming"
      @update:selected-table-id="t.selectedTableId.value = $event"
      @refresh="t.loadTables()"
      @create-table="handleCreateTable"
      @delete-table="handleDeleteTable"
    />

    <v-card v-if="t.selectedTable.value">
      <v-card-text>
        <v-text-field
          v-model="t.prefixFilter.value"
          prepend-inner-icon="mdi-magnify"
          placeholder="Filter by MCCMNC prefix (server-side, like-prefix match)"
          clearable
          density="compact"
          class="mb-3"
        />
        <v-data-table-server
          v-model:items-per-page="t.itemsPerPage.value"
          v-model:page="t.page.value"
          :items="displayRows"
          :items-length="t.rowsTotal.value"
          :headers="headers"
          :loading="t.rowsLoading.value"
          density="compact"
        >
          <template #item.prefix="{ item }">
            <code class="text-caption">{{ item.prefix }}</code>
          </template>
          <template #item.tariff="{ item }">
            <code v-if="item.tariff !== '—'" class="text-caption">{{ item.tariff }}</code>
            <span v-else class="text-medium-emphasis">—</span>
          </template>
          <template #item.actions="{ item }">
            <v-btn
              icon="mdi-pencil"
              variant="text"
              size="small"
              @click="editRow(item.raw)"
            />
            <v-btn
              icon="mdi-delete"
              variant="text"
              size="small"
              color="error"
              @click="askDeleteRow(item.raw)"
            />
          </template>
        </v-data-table-server>
      </v-card-text>
    </v-card>

    <v-card v-else variant="tonal">
      <v-card-text class="text-center text-medium-emphasis py-8">
        <template v-if="t.tablesLoading.value">Loading tables…</template>
        <template v-else-if="t.tables.value.length === 0">
          No roaming tables exist yet. Use <b>New table</b> above to create one.
        </template>
        <template v-else>Pick a table above to view its roaming rows.</template>
      </v-card-text>
    </v-card>

    <TariffRoamingRowDialog ref="rowDialog" @save="saveRow" />
    <ConfirmDialog
      ref="tableDeleteConfirm"
      title="Delete roaming table"
      :message="tableDeleteMessage"
      confirm-text="Delete table"
    />
    <ConfirmDialog
      ref="rowDeleteConfirm"
      title="Delete roaming row"
      :message="rowDeleteMessage"
      confirm-text="Delete row"
    />
  </div>
</template>
