<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useIpdrViewer } from '@/composables/useIpdrViewer';
import { useFormatters } from '@/composables/useFormatters';
import { characteristic, characteristicNumber, type Usage } from '@/types/tmf';

/*
 * IPDR VoIP viewer — ports `priv/www/src/sig-ipdr-list-voip.js` and
 * `sig-ipdr-log-files-voip.js`. Shares the file-list / selection /
 * analyze plumbing with the WLAN viewer via `useIpdrViewer`; differs
 * only in the record columns, which follow the VoIP IPDR schema
 * (see `#ipdr_voip{}` in include/ocs_log.hrl).
 */

const v = useIpdrViewer('voip');
const { duration, number } = useFormatters();

const page = ref(1);
const itemsPerPage = ref(50);
const filterText = ref('');

onMounted(() => void v.loadFiles());

function matches(u: Usage, needle: string): boolean {
  if (!needle) return true;
  const n = needle.toLowerCase();
  const haystack = [
    u.date,
    characteristic(u, 'subscriberId'),
    characteristic(u, 'uniqueCallID'),
    characteristic(u, 'hostName'),
    characteristic(u, 'destinationID'),
    characteristic(u, 'callCompletionCode'),
    characteristic(u, 'disconnectReason'),
    characteristic(u, 'ani'),
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
  { title: 'Subscriber', key: 'subscriber' },
  { title: 'Call ID', key: 'callId' },
  { title: 'Host', key: 'host' },
  { title: 'Destination', key: 'dest' },
  { title: 'Start', key: 'start' },
  { title: 'End', key: 'end' },
  { title: 'Duration', key: 'dur', align: 'end' as const },
  { title: 'Completion', key: 'completion', width: '110px' },
  { title: 'Disconnect', key: 'disconnect', width: '110px' },
];

const rows = computed(() =>
  paginatedRecords.value.map((u) => {
    // Prefer callDuration; fall back to totalDuration. Both are integer
    // seconds on the backend per the ipdr_voip record_info spec.
    const durSec = characteristicNumber(u, 'callDuration')
      ?? characteristicNumber(u, 'totalDuration');
    return {
      creation: characteristic(u, 'ipdrCreationTime') ?? u.date ?? '—',
      seq: characteristicNumber(u, 'seqNum'),
      subscriber: characteristic(u, 'subscriberId') ?? '—',
      callId: characteristic(u, 'uniqueCallID') ?? '—',
      host: characteristic(u, 'hostName') ?? '—',
      dest: characteristic(u, 'destinationID') ?? '—',
      start: characteristic(u, 'startTime') ?? '—',
      end: characteristic(u, 'endTime') ?? '—',
      dur: duration(durSec),
      completion: characteristic(u, 'callCompletionCode') ?? '—',
      disconnect: characteristic(u, 'disconnectReason') ?? '—',
      raw: u,
    };
  }),
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
      <h1 class="text-h5 font-weight-medium">IPDR VoIP logs</h1>
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
                No IPDR VoIP files match the current date filter.
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
          placeholder="Filter across subscriber, call ID, host, destination, completion, disconnect…"
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
          <template #item.subscriber="{ item }">
            <code v-if="item.subscriber !== '—'" class="text-caption">
              {{ item.subscriber }}
            </code>
            <span v-else class="text-medium-emphasis">—</span>
          </template>
          <template #item.callId="{ item }">
            <code v-if="item.callId !== '—'" class="text-caption">
              {{ item.callId }}
            </code>
            <span v-else class="text-medium-emphasis">—</span>
          </template>
          <template #item.host="{ item }">
            <code v-if="item.host !== '—'" class="text-caption">
              {{ item.host }}
            </code>
            <span v-else class="text-medium-emphasis">—</span>
          </template>
          <template #item.dest="{ item }">
            <code v-if="item.dest !== '—'" class="text-caption">
              {{ item.dest }}
            </code>
            <span v-else class="text-medium-emphasis">—</span>
          </template>
          <template #item.seq="{ item }">
            <span class="text-caption">{{ number(item.seq) }}</span>
          </template>
          <template #item.completion="{ item }">
            <v-chip v-if="item.completion !== '—'" size="x-small" variant="tonal">
              {{ item.completion }}
            </v-chip>
            <span v-else class="text-medium-emphasis">—</span>
          </template>
          <template #item.disconnect="{ item }">
            <v-chip v-if="item.disconnect !== '—'" size="x-small" variant="tonal">
              {{ item.disconnect }}
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
