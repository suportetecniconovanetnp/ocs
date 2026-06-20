<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { logsApi } from '@/services';
import { useAsyncResource } from '@/composables/useAsyncResource';
import { characteristic, characteristicNumber, type Usage } from '@/types/tmf';

const page = ref(1);
const itemsPerPage = ref(50);
const etag = ref<string>();

const range = computed(() => {
  const start = (page.value - 1) * itemsPerPage.value;
  return { start, end: start + itemsPerPage.value - 1 };
});

const logs = useAsyncResource(() =>
  logsApi.accounting(range.value.start, range.value.end, undefined, page.value > 1 ? etag.value : undefined),
);
watch([page, itemsPerPage], () => void logs.reload());
watch(
  () => logs.data.value?.etag,
  (nextEtag) => {
    if (nextEtag) etag.value = nextEtag;
  },
);

const total = computed(() => logs.data.value?.contentRange?.total ?? logs.data.value?.total ?? 0);
watch(total, (nextTotal) => {
  const maxPage = Math.max(1, Math.ceil(nextTotal / itemsPerPage.value));
  if (page.value > maxPage) page.value = maxPage;
});

const headers = [
  { title: 'Date', key: 'date' },
  { title: 'Type', key: 'type' },
  { title: 'Username', key: 'username' },
  { title: 'IMSI', key: 'imsi' },
  { title: 'MSISDN', key: 'msisdn' },
  { title: 'Input bytes', key: 'inputOctets' },
  { title: 'Output bytes', key: 'outputOctets' },
  { title: 'Duration (s)', key: 'duration' },
];

function row(item: Usage) {
  return {
    date: item.date,
    type: characteristic(item, 'type') ?? item.status ?? '—',
    username: characteristic(item, 'username'),
    imsi: characteristic(item, 'imsi'),
    msisdn: characteristic(item, 'msisdn'),
    // SigScale uses inputOctets/outputOctets (not acct-prefixed) — see
    // legacy sig-accounting-list.js characteristic lookups.
    inputOctets: characteristicNumber(item, 'inputOctets'),
    outputOctets: characteristicNumber(item, 'outputOctets'),
    duration: characteristicNumber(item, 'acctSessionTime'),
  };
}

const rows = computed(() => (logs.data.value?.items ?? []).map(row));
</script>

<template>
  <div>
    <h1 class="text-h5 font-weight-medium mb-4">Accounting Logs</h1>
    <v-card>
      <v-card-text>
        <v-data-table-server
          v-model:items-per-page="itemsPerPage"
          v-model:page="page"
          :items="rows"
          :items-length="total"
          :items-per-page-options="[25, 50, 100, 200]"
          :headers="headers"
          :loading="logs.loading.value"
          density="compact"
        />
      </v-card-text>
    </v-card>
  </div>
</template>
