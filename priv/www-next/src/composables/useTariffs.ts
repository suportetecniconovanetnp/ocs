import { computed, ref, watch } from 'vue';
import {
  tariffsApi,
  charString,
  diffCharacteristics,
  type TariffRowInput,
} from '@/services';
import { useNotificationsStore } from '@/stores/notifications';
import type { Characteristic, Resource, TariffKind } from '@/types/tmf';
import { TARIFF_SPEC } from '@/types/tmf';

/**
 * Shared state + orchestration for the three tariff viewers
 * (rate / period / roaming). The three views share:
 *
 *   1. A tables dropdown (parent #resource of spec id 1/5/7).
 *   2. A rows table, server-side paginated and filterable by prefix.
 *   3. Add / edit / delete dialogs that each view configures with
 *      kind-specific characteristics.
 *
 * This composable owns the fetch orchestration, selection state, and
 * mutation helpers. Views contribute the kind (rate|period|roaming)
 * and the characteristic schema used when building row payloads.
 */
export function useTariffs(kind: TariffKind) {
  const spec = TARIFF_SPEC[kind];
  const notifications = useNotificationsStore();

  /* ----- tables state ----- */
  const tables = ref<Resource[]>([]);
  const tablesLoading = ref(false);
  const selectedTableId = ref<string>('');

  const selectedTable = computed<Resource | undefined>(() =>
    tables.value.find((t) => t.id === selectedTableId.value),
  );

  async function loadTables(): Promise<void> {
    tablesLoading.value = true;
    try {
      const page = await tariffsApi.listTables(spec.tableId, 0, 499);
      tables.value = page.items ?? [];
      // Keep selection when possible; otherwise default to the first.
      if (selectedTableId.value && !tables.value.some((t) => t.id === selectedTableId.value)) {
        selectedTableId.value = '';
      }
      if (!selectedTableId.value && tables.value.length > 0) {
        selectedTableId.value = tables.value[0]!.id;
      }
    } catch {
      tables.value = [];
    } finally {
      tablesLoading.value = false;
    }
  }

  async function createTable(payload: { name: string; description?: string }): Promise<boolean> {
    try {
      const created = await tariffsApi.createTable(spec.tableId, payload);
      await loadTables();
      selectedTableId.value = created.id;
      notifications.success(`Table "${payload.name}" created.`);
      return true;
    } catch {
      return false;
    }
  }

  async function deleteTable(id: string): Promise<boolean> {
    try {
      await tariffsApi.deleteTable(id);
      notifications.success('Table deleted.');
      if (selectedTableId.value === id) selectedTableId.value = '';
      await loadTables();
      return true;
    } catch {
      return false;
    }
  }

  /* ----- rows state ----- */
  const rows = ref<Resource[]>([]);
  const rowsLoading = ref(false);
  const rowsTotal = ref(0);
  const page = ref(1);
  const itemsPerPage = ref(50);
  const prefixFilter = ref('');

  const rangeWindow = computed(() => {
    const start = (page.value - 1) * itemsPerPage.value;
    return { start, end: start + itemsPerPage.value - 1 };
  });

  async function loadRows(): Promise<void> {
    const table = selectedTable.value;
    if (!table || !table.name) {
      rows.value = [];
      rowsTotal.value = 0;
      return;
    }
    rowsLoading.value = true;
    try {
      const result = await tariffsApi.listRows(spec.rowId, table.name, {
        start: rangeWindow.value.start,
        end: rangeWindow.value.end,
        prefix: prefixFilter.value.trim() || undefined,
      });
      rows.value = result.items ?? [];
      rowsTotal.value = result.contentRange?.total ?? result.total ?? rows.value.length;
    } catch {
      rows.value = [];
      rowsTotal.value = 0;
    } finally {
      rowsLoading.value = false;
    }
  }

  // Debounced prefix filter — resets to page 1 before firing the reload.
  let prefixTimer: ReturnType<typeof setTimeout> | undefined;
  watch(prefixFilter, () => {
    if (prefixTimer) clearTimeout(prefixTimer);
    prefixTimer = setTimeout(() => {
      page.value = 1;
      void loadRows();
    }, 250);
  });

  watch([page, itemsPerPage, selectedTableId], () => void loadRows());

  async function createRow(input: TariffRowInput): Promise<boolean> {
    const table = selectedTable.value;
    if (!table || !table.name) {
      notifications.warning('Pick a table before adding a row.');
      return false;
    }
    try {
      await tariffsApi.createRow(
        spec.rowId,
        spec.rowSpecName,
        { id: table.id, name: table.name },
        input,
      );
      notifications.success('Row added.');
      await loadRows();
      return true;
    } catch {
      return false;
    }
  }

  async function updateRow(
    existing: Resource,
    nextChars: Characteristic[],
  ): Promise<boolean> {
    const ops = diffCharacteristics(existing.resourceCharacteristic, nextChars);
    if (ops.length === 0) {
      notifications.info('Nothing to update.');
      return true;
    }
    try {
      await tariffsApi.patchRow(existing.id, ops);
      notifications.success('Row updated.');
      await loadRows();
      return true;
    } catch {
      return false;
    }
  }

  async function deleteRow(row: Resource): Promise<boolean> {
    try {
      await tariffsApi.deleteRow(row.id);
      const label = charString(row, 'prefix') ?? row.id;
      notifications.success(`Row "${label}" deleted.`);
      await loadRows();
      return true;
    } catch {
      return false;
    }
  }

  return {
    // tables
    tables,
    tablesLoading,
    selectedTableId,
    selectedTable,
    loadTables,
    createTable,
    deleteTable,
    // rows
    rows,
    rowsLoading,
    rowsTotal,
    page,
    itemsPerPage,
    prefixFilter,
    loadRows,
    createRow,
    updateRow,
    deleteRow,
  };
}
