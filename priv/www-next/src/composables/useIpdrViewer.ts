import { computed, ref } from 'vue';
import { logsApi, type IpdrType } from '@/services';
import { useNotificationsStore } from '@/stores/notifications';
import type { Usage } from '@/types/tmf';

/**
 * Shared state + orchestration for the IPDR WLAN and VoIP viewers. The
 * backend exposes IPDR logs as discrete files per rotation — this
 * composable lets a view:
 *
 *   1. Fetch the file list once on mount;
 *   2. Filter the file list client-side by a YYYY-MM-DD date window
 *      (the backend doesn't expose a filter on this endpoint);
 *   3. Let the operator select files explicitly (or use "select all");
 *   4. Trigger a parallel fetch of the selected files' records via
 *      `analyzeSelected()`, with a concurrency cap so we don't hammer
 *      the server when the operator selects dozens of files.
 *
 * The returned `records` ref is a flat array of Usage objects — each
 * WLAN or VoIP IPDR record is a TMF Usage whose `usageCharacteristic`
 * carries the interesting fields. Views cast per-type in the template.
 *
 * Compatibility principle: each of the three API calls (file list,
 * per-file records) is an exact match for the legacy Polymer
 * `sig-ipdr-list-{wlan,voip}.js` data provider. If upstream adds a
 * query param or renames a field, the change lands in one place
 * (`services/logs.ts`) and this composable keeps working.
 */
export function useIpdrViewer(type: IpdrType) {
  const notifications = useNotificationsStore();

  const files = ref<string[]>([]);
  const filesLoading = ref(false);
  const selectedFiles = ref<Set<string>>(new Set());

  // Date filter for the file-list pane. Filenames are ISO-8601 strings
  // (e.g. "2026-04-24T14:28:34.123"), so a simple substring prefix match
  // on YYYY-MM-DD covers the common "show me day X" use case.
  const dateFrom = ref('');
  const dateTo = ref('');

  // Loaded records state.
  const records = ref<Usage[]>([]);
  const analyzing = ref(false);
  const analyzeProgress = ref({ loaded: 0, total: 0 });
  /** Tracks whether analyzeSelected has completed at least once. Lets the
   *  view distinguish "initial state" from "analyze ran but produced no
   *  records", which have very different meanings to the operator. */
  const analyzed = ref(false);
  /** Summary of the last analyze run — used by the empty-state card when
   *  records is empty post-analyze. */
  const lastRunSummary = ref<{ filesRead: number; filesFailed: number }>({
    filesRead: 0,
    filesFailed: 0,
  });

  /** Parse the leading YYYY-MM-DD from a filename, or undefined if invalid. */
  function fileDate(name: string): string | undefined {
    const m = name.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : undefined;
  }

  const filteredFiles = computed(() => {
    const from = dateFrom.value;
    const to = dateTo.value;
    return files.value.filter((name) => {
      const d = fileDate(name);
      if (!d) return !from && !to; // If unparseable, only show when no filter.
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  });

  const selectedCount = computed(() => {
    let n = 0;
    for (const name of filteredFiles.value) {
      if (selectedFiles.value.has(name)) n++;
    }
    return n;
  });

  const allFilteredSelected = computed(
    () => filteredFiles.value.length > 0 && selectedCount.value === filteredFiles.value.length,
  );

  async function loadFiles(): Promise<void> {
    filesLoading.value = true;
    try {
      files.value = await logsApi.ipdrFiles(type);
    } catch {
      files.value = [];
    } finally {
      filesLoading.value = false;
    }
  }

  function toggleFile(name: string): void {
    const next = new Set(selectedFiles.value);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    selectedFiles.value = next;
  }

  function toggleAllFiltered(): void {
    const next = new Set(selectedFiles.value);
    if (allFilteredSelected.value) {
      for (const name of filteredFiles.value) next.delete(name);
    } else {
      for (const name of filteredFiles.value) next.add(name);
    }
    selectedFiles.value = next;
  }

  function clearSelection(): void {
    selectedFiles.value = new Set();
  }

  /**
   * Fetch all records from one file, handling multi-page cases. Default
   * `rest_page_size` on the backend is 1000, so a single request usually
   * suffices — but we loop defensively in case a file ever exceeds it.
   */
  async function fetchOneFile(file: string): Promise<Usage[]> {
    const collected: Usage[] = [];
    const CHUNK = 1000;
    let offset = 0;
    while (true) {
      const page = await logsApi.ipdrRecords(type, file, offset, offset + CHUNK - 1);
      const items = page.items ?? [];
      collected.push(...items);
      const total = page.contentRange?.total ?? page.total;
      if (items.length === 0) break;
      if (total != null && collected.length >= total) break;
      if (items.length < CHUNK) break; // Short read — nothing more.
      offset += CHUNK;
    }
    return collected;
  }

  /**
   * Trigger fetches for every selected file with a concurrency cap.
   * Populates `records` with the aggregated set, sorted newest-first
   * by the `date` field when present.
   */
  async function analyzeSelected(): Promise<void> {
    const targets = Array.from(selectedFiles.value).filter((name) =>
      filteredFiles.value.includes(name),
    );
    if (targets.length === 0) {
      notifications.warning('Select at least one log file before analyzing.');
      return;
    }
    analyzing.value = true;
    analyzeProgress.value = { loaded: 0, total: targets.length };

    const CONCURRENCY = 4;
    const queue = [...targets];
    const collected: Usage[] = [];
    const workers: Promise<void>[] = [];
    let failures = 0;

    async function worker(): Promise<void> {
      while (queue.length > 0) {
        const file = queue.shift();
        if (!file) break;
        try {
          const rows = await fetchOneFile(file);
          collected.push(...rows);
        } catch {
          failures++;
        } finally {
          analyzeProgress.value = {
            loaded: analyzeProgress.value.loaded + 1,
            total: targets.length,
          };
        }
      }
    }

    for (let i = 0; i < Math.min(CONCURRENCY, targets.length); i++) {
      workers.push(worker());
    }
    try {
      await Promise.all(workers);
      collected.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
      records.value = collected;
      lastRunSummary.value = {
        filesRead: targets.length - failures,
        filesFailed: failures,
      };
      analyzed.value = true;
      if (failures > 0 && collected.length === 0) {
        notifications.error(
          `All ${failures} selected file${failures === 1 ? '' : 's'} failed to read. Check the OCS error log for details.`,
        );
      } else if (failures > 0) {
        notifications.warning(
          `Loaded ${collected.length} record${collected.length === 1 ? '' : 's'} from ${targets.length - failures} file${targets.length - failures === 1 ? '' : 's'} — ${failures} failed.`,
        );
      } else if (collected.length === 0) {
        notifications.info(
          `Analyzed ${targets.length} file${targets.length === 1 ? '' : 's'}, but none contained records for the selected window.`,
        );
      } else {
        notifications.success(
          `Analyzed ${targets.length} file${targets.length === 1 ? '' : 's'} · ${collected.length} records.`,
        );
      }
    } finally {
      analyzing.value = false;
    }
  }

  return {
    // file list
    files,
    filesLoading,
    filteredFiles,
    dateFrom,
    dateTo,
    fileDate,
    loadFiles,
    // selection
    selectedFiles,
    selectedCount,
    allFilteredSelected,
    toggleFile,
    toggleAllFiltered,
    clearSelection,
    // analyze
    records,
    analyzing,
    analyzed,
    analyzeProgress,
    analyzeSelected,
    lastRunSummary,
  };
}
