<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useIpdrViewer } from '@/composables/useIpdrViewer';
import { useFormatters } from '@/composables/useFormatters';
import { characteristic, characteristicNumber, type Usage } from '@/types/tmf';

/*
 * IPDR WLAN viewer — ports `priv/www/src/sig-ipdr-list-wlan.js` and
 * `sig-ipdr-log-files-voip.js` (the legacy WLAN variant is missing,
 * so we provide the unified experience here). Operator flow:
 *   1. Date filter narrows the file list.
 *   2. Select one or more files.
 *   3. Click "Analyze" — the composable fetches the selected files
 *      in parallel (4 at a time) and aggregates records into a flat
 *      paginated table with client-side free-text filtering.
 * Record fields mirror the WLAN IPDR characteristics enumerated in
 * `src/ocs_rest_res_usage.erl` (ipdr_wlan record_info).
 */

const v = useIpdrViewer('wlan');
const { bytes, duration, number } = useFormatters();

const page = ref(1);
const itemsPerPage = ref(50);
const filterText = ref('');

onMounted(() => void v.loadFiles());

/** Broad text search across the common identifying characteristics. */
function matches(u: Usage, needle: string): boolean {
  if (!needle) return true;
  const n = needle.toLowerCase();
  const haystack = [
    u.date,
    characteristic(u, 'username'),
    characteristic(u, 'callingStationId'),
    characteristic(u, 'calledStationId'),
    characteristic(u, 'nasIpAddress'),
    characteristic(u, 'nasId'),
    characteristic(u, 'acctSessionId'),
    characteristic(u, 'sessionTerminateCause'),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(n);
}

const filteredRecords = computed(() =>
  v.records.value.filter((u) => matches(u, filterText.value.trim())),
);

const totalRecords = computed(() => filteredRecords.value.length);

const paginatedRecords = computed(() => {
  const start = (page.value - 1) * itemsPerPage.value;
  return filteredRecords.value.slice(start, start + itemsPerPage.value);
});

const headers = [
  { title: 'Creation time', key: 'creation' },
  { title: 'Seq', key: 'seq', width: '70px' },
  { title: 'Username', key: 'username' },
  { title: 'Session ID', key: 'sessionId' },
  { title: 'Calling station', key: 'callingStation' },
  { title: 'Called station', key: 'calledStation' },
  { title: 'NAS IP', key: 'nasIp' },
  { title: 'NAS ID', key: 'nasId' },
  { title: 'Duration', key: 'dur', align: 'end' as const },
  { title: 'Input', key: 'input', align: 'end' as const },
  { title: 'Output', key: 'output', align: 'end' as const },
  { title: 'Start', key: 'start' },
  { title: 'End', key: 'end' },
  { title: 'Cause', key: 'cause', width: '80px' },
];

const rows = computed(() =>
  paginatedRecords.value.map((u) => ({
    creation: characteristic(u, 'ipdrCreationTime') ?? u.date ?? '—',
    seq: characteristicNumber(u, 'seqNum'),
    username: characteristic(u, 'username') ?? '—',
    sessionId: characteristic(u, 'acctSessionId') ?? '—',
    callingStation: characteristic(u, 'callingStationId') ?? '—',
    calledStation: characteristic(u, 'calledStationId') ?? '—',
    nasIp: characteristic(u, 'nasIpAddress') ?? '—',
    nasId: characteristic(u, 'nasId') ?? '—',
    dur: duration(characteristicNumber(u, 'sessionDuration')),
    input: bytes(characteristicNumber(u, 'inputOctets')),
    output: bytes(characteristicNumber(u, 'outputOctets')),
    start: characteristic(u, 'gmtSessionStartDateTime') ?? '—',
    end: characteristic(u, 'gmtSessionEndDateTime') ?? '—',
    cause: characteristic(u, 'sessionTerminateCause') ?? '—',
    raw: u,
  })),
);

const analyzeLabel = computed(() => {
  if (v.analyzing.value) {
    const { loaded, total } = v.analyzeProgress.value;
    return `Analyzing… ${loaded} / ${total}`;
  }
  return v.selectedCount.value > 0
    ? `Analyze selected (${v.selectedCount.value})`
    : 'Analyze selected';
});

const selectAllLabel = computed(() =>
  v.allFilteredSelected.value ? 'Unselect all' : 'Select all (filtered)',
);
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <h1 class="text-h5 font-weight-medium">IPDR WLAN logs</h1>
      <v-spacer />
      <v-btn prepend-icon="mdi-refresh" variant="tonal" @click="v.loadFiles()">
        Refresh file list
      </v-btn>
    </div>

    <!-- ============ FILE SELECTION CARD ============ -->
    <v-card class="mb-4">
      <v-card-text>
        <div class="d-flex flex-wrap ga-3 mb-3">
          <v-text-field
            v-model="v.dateFrom.value"
            type="date"
            label="From date"
            density="compact"
            clearable
            style="max-width: 200px"
          />
          <v-text-field
            v-model="v.dateTo.value"
            type="date"
            label="To date"
            density="compact"
            clearable
            style="max-width: 200px"
          />
          <v-spacer />
          <v-btn
            variant="text"
            size="small"
            :disabled="v.filteredFiles.value.length === 0"
            @click="v.toggleAllFiltered()"
          >
            {{ selectAllLabel }}
          </v-btn>
          <v-btn
            variant="text"
            size="small"
            :disabled="v.selectedCount.value === 0"
            @click="v.clearSelection()"
          >
            Clear selection
          </v-btn>
        </div>

        <div class="text-caption text-medium-emphasis mb-2">
          {{ v.filteredFiles.value.length }} file{{ v.filteredFiles.value.length === 1 ? '' : 's' }}
          match the filter · {{ v.selectedCount.value }} selected.
        </div>

        <v-progress-linear v-if="v.filesLoading.value" indeterminate class="mb-2" />

        <!-- File list table. One checkbox column, one filename column,
             one parsed-date column. Keeps density compact so dozens of
             files stay visible without scrolling. -->
        <v-table density="compact" class="ipdr-file-table">
          <thead>
            <tr>
              <th style="width: 50px"></th>
              <th>Filename</th>
              <th style="width: 140px">Date</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="name in v.filteredFiles.value"
              :key="name"
              :class="{ 'selected-row': v.selectedFiles.value.has(name) }"
              @click="v.toggleFile(name)"
            >
              <td>
                <v-checkbox
                  :model-value="v.selectedFiles.value.has(name)"
                  density="compact"
                  hide-details
                  @update:model-value="v.toggleFile(name)"
                  @click.stop
                />
              </td>
              <td><code class="text-caption">{{ name }}</code></td>
              <td>{{ v.fileDate(name) ?? '—' }}</td>
            </tr>
            <tr v-if="v.filteredFiles.value.length === 0 && !v.filesLoading.value">
              <td colspan="3" class="text-center text-medium-emphasis py-6">
                No IPDR WLAN files match the current date filter.
              </td>
            </tr>
          </tbody>
        </v-table>

        <div class="d-flex justify-end mt-4">
          <v-btn
            color="primary"
            size="large"
            :loading="v.analyzing.value"
            :disabled="v.selectedCount.value === 0"
            prepend-icon="mdi-chart-line"
            @click="v.analyzeSelected()"
          >
            {{ analyzeLabel }}
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <!-- ============ RECORDS CARD ============ -->
    <v-card v-if="v.records.value.length > 0">
      <v-card-text>
        <v-text-field
          v-model="filterText"
          prepend-inner-icon="mdi-magnify"
          placeholder="Filter across username, stations, NAS, session ID, cause…"
          clearable
          :hint="`${totalRecords} of ${v.records.value.length} aggregated records.`"
          persistent-hint
          class="mb-3"
        />
        <v-data-table-server
          v-model:items-per-page="itemsPerPage"
          v-model:page="page"
          :items="rows"
          :items-length="totalRecords"
          :headers="headers"
          density="compact"
        >
          <template #item.username="{ item }">
            <code v-if="item.username !== '—'" class="text-caption">
              {{ item.username }}
            </code>
            <span v-else class="text-medium-emphasis">—</span>
          </template>
          <template #item.callingStation="{ item }">
            <code v-if="item.callingStation !== '—'" class="text-caption">
              {{ item.callingStation }}
            </code>
            <span v-else class="text-medium-emphasis">—</span>
          </template>
          <template #item.calledStation="{ item }">
            <code v-if="item.calledStation !== '—'" class="text-caption">
              {{ item.calledStation }}
            </code>
            <span v-else class="text-medium-emphasis">—</span>
          </template>
          <template #item.nasIp="{ item }">
            <code v-if="item.nasIp !== '—'" class="text-caption">
              {{ item.nasIp }}
            </code>
            <span v-else class="text-medium-emphasis">—</span>
          </template>
          <template #item.seq="{ item }">
            <span class="text-caption">{{ number(item.seq) }}</span>
          </template>
          <template #item.cause="{ item }">
            <v-chip v-if="item.cause !== '—'" size="x-small" variant="tonal">
              {{ item.cause }}
            </v-chip>
            <span v-else class="text-medium-emphasis">—</span>
          </template>
        </v-data-table-server>
      </v-card-text>
    </v-card>

    <v-card v-else variant="tonal">
      <v-card-text class="text-center py-8">
        <template v-if="!v.analyzed.value">
          <div class="text-medium-emphasis">
            Select one or more files above and click <b>Analyze</b> to load records.
          </div>
        </template>
        <template v-else-if="v.lastRunSummary.value.filesFailed > 0 && v.lastRunSummary.value.filesRead === 0">
          <v-icon icon="mdi-alert-circle" color="error" size="32" class="mb-2" />
          <div class="text-error">
            All {{ v.lastRunSummary.value.filesFailed }} selected file{{ v.lastRunSummary.value.filesFailed === 1 ? '' : 's' }} failed to read.
          </div>
          <div class="text-caption text-medium-emphasis mt-1">
            Check the OCS error log — typical causes are in-flight rotations or corrupted tails on old files.
          </div>
        </template>
        <template v-else>
          <v-icon icon="mdi-information-outline" size="32" class="mb-2" />
          <div class="text-medium-emphasis">
            Analyzed {{ v.lastRunSummary.value.filesRead }} file{{ v.lastRunSummary.value.filesRead === 1 ? '' : 's' }}, no records in the selected window.
          </div>
          <div v-if="v.lastRunSummary.value.filesFailed > 0" class="text-caption text-warning mt-1">
            ({{ v.lastRunSummary.value.filesFailed }} file{{ v.lastRunSummary.value.filesFailed === 1 ? '' : 's' }} failed to read — see the OCS log.)
          </div>
        </template>
      </v-card-text>
    </v-card>
  </div>
</template>

<style scoped>
.ipdr-file-table tbody tr {
  cursor: pointer;
}
.ipdr-file-table tbody tr.selected-row {
  background-color: rgba(var(--v-theme-primary), 0.08);
}
</style>
