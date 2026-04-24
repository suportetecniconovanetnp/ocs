<script setup lang="ts">
import { computed, ref } from 'vue';
import { logsApi } from '@/services';
import { useAsyncResource } from '@/composables/useAsyncResource';
import type { HttpEvent } from '@/types/tmf';

/*
 * Mirrors the legacy `priv/www/src/sig-http-list.js`. The backend
 * (`ocs_rest_res_http:get_http/0`) ignores Range headers and always
 * returns the latest `rest_page_size` items. The Polymer component
 * creates the illusion of server-side pagination but actually serves
 * the same payload on every page — client-side pagination is the
 * honest representation.
 */

const page = ref(1);
const itemsPerPage = ref(50);
const filterText = ref('');

const logs = useAsyncResource(() => logsApi.http(0, 999));

/** Free-text filter that matches across host / user / method / uri / status. */
function matches(e: HttpEvent, needle: string): boolean {
  if (!needle) return true;
  const n = needle.toLowerCase();
  if (e.host?.toLowerCase().includes(n)) return true;
  if (e.user?.toLowerCase().includes(n)) return true;
  if (e.method?.toLowerCase().includes(n)) return true;
  if (e.uri?.toLowerCase().includes(n)) return true;
  if (String(e.httpStatus ?? '').includes(n)) return true;
  if (e.datetime?.toLowerCase().includes(n)) return true;
  return false;
}

const filtered = computed<HttpEvent[]>(() => {
  const all = logs.data.value?.items ?? [];
  return all.filter((e) => matches(e, filterText.value.trim()));
});

const total = computed(() => filtered.value.length);

const paginated = computed(() => {
  const start = (page.value - 1) * itemsPerPage.value;
  return filtered.value.slice(start, start + itemsPerPage.value);
});

/**
 * Status color bucket — HTTP 2xx green, 3xx info, 4xx warning, 5xx error.
 * Renders as a small Vuetify chip for quick eyeballing.
 */
function statusColor(status: number | undefined): string {
  if (status == null) return 'default';
  if (status >= 200 && status < 300) return 'success';
  if (status >= 300 && status < 400) return 'info';
  if (status >= 400 && status < 500) return 'warning';
  if (status >= 500) return 'error';
  return 'default';
}

const headers = [
  { title: 'Date & time', key: 'datetime', width: '220px' },
  { title: 'Host', key: 'host' },
  { title: 'User', key: 'user' },
  { title: 'Method', key: 'method', width: '90px' },
  { title: 'URI', key: 'uri' },
  { title: 'Status', key: 'httpStatus', width: '90px' },
];

const rows = computed(() =>
  paginated.value.map((e) => ({
    datetime: e.datetime ?? '—',
    host: e.host ?? '—',
    user: e.user && e.user !== '-' ? e.user : '—',
    method: e.method ?? '—',
    uri: e.uri ?? '—',
    httpStatus: e.httpStatus,
    raw: e,
  })),
);
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <h1 class="text-h5 font-weight-medium">HTTP access log</h1>
      <v-spacer />
      <v-btn prepend-icon="mdi-refresh" variant="tonal" @click="logs.reload">
        Refresh
      </v-btn>
    </div>

    <v-card>
      <v-card-text>
        <v-text-field
          v-model="filterText"
          prepend-inner-icon="mdi-magnify"
          placeholder="Filter across host, user, method, URI, status…"
          clearable
          :hint="`${total} of ${logs.data.value?.items.length ?? 0} entries (server returns the last N configured by rest_page_size).`"
          persistent-hint
          class="mb-3"
        />

        <v-data-table-server
          v-model:items-per-page="itemsPerPage"
          v-model:page="page"
          :items="rows"
          :items-length="total"
          :headers="headers"
          :loading="logs.loading.value"
          density="compact"
        >
          <template #item.host="{ item }">
            <code class="text-caption">{{ item.host }}</code>
          </template>
          <template #item.method="{ item }">
            <v-chip size="x-small" variant="tonal">{{ item.method }}</v-chip>
          </template>
          <template #item.uri="{ item }">
            <code class="text-caption">{{ item.uri }}</code>
          </template>
          <template #item.httpStatus="{ item }">
            <v-chip
              v-if="item.httpStatus != null"
              size="small"
              :color="statusColor(item.httpStatus)"
            >
              {{ item.httpStatus }}
            </v-chip>
            <span v-else class="text-medium-emphasis">—</span>
          </template>
        </v-data-table-server>
      </v-card-text>
    </v-card>
  </div>
</template>
