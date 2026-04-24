<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useTariffs } from '@/composables/useTariffs';
import { charString } from '@/services';
import TariffTablePicker from '@/components/TariffTablePicker.vue';
import TariffPeriodRowDialog from '@/components/TariffPeriodRowDialog.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import type { Characteristic, Resource } from '@/types/tmf';

/*
 * Period tariffs — two-tier time-based prefix tables.
 * Ports `sig-period-table-list.js` + `sig-tariff-period-list.js`
 * with the same master-detail shape as TariffRateView. The rate
 * differences land in the row dialog; everything else is identical
 * to the rate flow.
 */

const t = useTariffs('period');
const rowDialog = ref<InstanceType<typeof TariffPeriodRowDialog> | null>(null);
const tableDeleteConfirm = ref<InstanceType<typeof ConfirmDialog> | null>(null);
const rowDeleteConfirm = ref<InstanceType<typeof ConfirmDialog> | null>(null);
const pendingTableDeleteId = ref('');
const pendingRowDelete = ref<Resource | null>(null);

onMounted(() => void t.loadTables());

const tableDeleteMessage = computed(() => {
  const table = t.tables.value.find((x) => x.id === pendingTableDeleteId.value);
  if (!table) return '';
  return `Permanently delete the period table "${table.name}" and every row inside it? The rating engine will stop finding matches for this table immediately.`;
});

const rowDeleteMessage = computed(() => {
  const row = pendingRowDelete.value;
  if (!row) return '';
  const prefix = charString(row, 'prefix') ?? row.id;
  return `Permanently delete the row with prefix "${prefix}"? Subscribers whose sessions match this prefix will fall through to the next-closest prefix match (or fail rating if none).`;
});

const headers = [
  { title: 'Prefix', key: 'prefix' },
  { title: 'Description', key: 'description' },
  { title: 'Initial period (s)', key: 'periodInitial', align: 'end' as const },
  { title: 'Initial rate', key: 'rateInitial', align: 'end' as const },
  { title: 'Additional period (s)', key: 'periodAdditional', align: 'end' as const },
  { title: 'Additional rate', key: 'rateAdditional', align: 'end' as const },
  { title: '', key: 'actions', sortable: false, align: 'end' as const, width: 120 },
];

const displayRows = computed(() =>
  t.rows.value.map((r) => ({
    id: r.id,
    prefix: charString(r, 'prefix') ?? '—',
    description: charString(r, 'description') ?? '—',
    periodInitial: charString(r, 'periodInitial') ?? '—',
    rateInitial: charString(r, 'rateInitial') ?? '—',
    periodAdditional: charString(r, 'periodAdditional') ?? '—',
    rateAdditional: charString(r, 'rateAdditional') ?? '—',
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
      <h1 class="text-h5 font-weight-medium">Period tariffs</h1>
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
      kind-label="Period"
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
          placeholder="Filter by prefix (server-side, like-prefix match)"
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
          No period tables exist yet. Use <b>New table</b> above to create one.
        </template>
        <template v-else>Pick a table above to view its period rows.</template>
      </v-card-text>
    </v-card>

    <TariffPeriodRowDialog ref="rowDialog" @save="saveRow" />
    <ConfirmDialog
      ref="tableDeleteConfirm"
      title="Delete period table"
      :message="tableDeleteMessage"
      confirm-text="Delete table"
    />
    <ConfirmDialog
      ref="rowDeleteConfirm"
      title="Delete period row"
      :message="rowDeleteMessage"
      confirm-text="Delete row"
    />
  </div>
</template>
