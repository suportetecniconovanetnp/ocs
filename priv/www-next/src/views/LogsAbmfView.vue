<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { logsApi } from '@/services';
import { useAsyncResource } from '@/composables/useAsyncResource';
import { useFormatters } from '@/composables/useFormatters';
import type { AbmfEvent, Quantity } from '@/types/tmf';

/*
 * Mirrors the legacy `priv/www/src/sig-balance-list.js` component 1:1 in
 * terms of data flow: same endpoint (`GET /ocs/v1/log/balance`), same
 * Range-header pagination, same Vaadin-style filter expression for the
 * server-side allowlist (type / subscriber / bucket / units / product),
 * same `date` query param. Field mapping follows the upstream rename
 * from `timeStamp` to `date` (commit c69e825b, Nov 2024).
 */

const { date, bytes, duration, money, number } = useFormatters();

const page = ref(1);
const itemsPerPage = ref(50);

// Filter inputs (debounced via watch → setTimeout). Empty strings mean
// "no filter on that path" — the logsApi layer drops them from the
// Vaadin expression before it hits the wire.
const filterDate = ref('');
const filterType = ref('');
const filterSubscriber = ref('');
const filterBucket = ref('');
const filterUnits = ref('');
const filterProduct = ref('');

const range = computed(() => {
  const start = (page.value - 1) * itemsPerPage.value;
  return { start, end: start + itemsPerPage.value - 1 };
});

const logs = useAsyncResource(() =>
  logsApi.abmf(range.value.start, range.value.end, {
    date: filterDate.value || undefined,
    type: filterType.value || undefined,
    subscriber: filterSubscriber.value || undefined,
    bucket: filterBucket.value || undefined,
    units: filterUnits.value || undefined,
    product: filterProduct.value || undefined,
  }),
);

watch([page, itemsPerPage], () => void logs.reload());

// Debounce filter inputs so we don't fire a request per keystroke.
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  [filterDate, filterType, filterSubscriber, filterBucket, filterUnits, filterProduct],
  () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      page.value = 1;
      void logs.reload();
    }, 300);
  },
);

const total = computed(
  () => logs.data.value?.contentRange?.total ?? logs.data.value?.total ?? 0,
);
watch(total, (nextTotal) => {
  const maxPage = Math.max(1, Math.ceil(nextTotal / itemsPerPage.value));
  if (page.value > maxPage) page.value = maxPage;
});

/**
 * Format a Quantity from an ABMF event, with units-aware rendering.
 *
 * IMPORTANT: the ABMF event codec in SigScale OCS
 * (ocs_rest_res_balance:abmf4/abmf5/abmf6) emits the raw internal
 * integer without calling `millionths_out`. For cents that means the
 * wire value is in MILLIONTHS of a cent (a 2000-cent top-up arrives
 * as 2000000000), unlike the bucket codec (`quantity/2`) which does
 * convert via `millionths_out` and yields a decimal string like "20".
 *
 * We adapt to what each codec actually sends:
 *   - cents  → divide by 1_000_000 to land on cents, then by 100 to
 *              land on the currency unit the `money()` formatter wants
 *   - octets → raw byte count, passed to `bytes()`
 *   - seconds → raw seconds, passed to `duration()`
 *   - messages → raw count
 */
function fmtQuantity(q: Quantity | undefined): string {
  if (!q || q.amount == null) return '—';
  const raw = typeof q.amount === 'number'
    ? q.amount
    : Number(String(q.amount).replace(/(b|s|msg)$/i, ''));
  if (!Number.isFinite(raw)) return String(q.amount);
  switch (q.units) {
    case 'cents':
      // raw is in millionths of a cent; /1e6 → cents; /100 → dollars.
      return money(raw / 100_000_000);
    case 'octets':
      return bytes(raw);
    case 'seconds':
      return duration(raw);
    case 'messages':
      return `${number(raw)} msg`;
    default:
      return `${number(raw)} ${q.units ?? ''}`.trim();
  }
}

/* ABMF event type atoms and a friendly mapping to Vuetify chip colours. */
const TYPE_COLORS: Record<string, string> = {
  topup: 'success',
  adjustment: 'info',
  transfer: 'info',
  reserve: 'warning',
  unreserve: 'default',
  deduct: 'error',
  delete: 'error',
};

function typeColor(type: string | undefined): string {
  return type ? (TYPE_COLORS[type] ?? 'default') : 'default';
}

const headers = [
  { title: 'Date', key: 'date' },
  { title: 'Type', key: 'type' },
  { title: 'Subscriber', key: 'subscriber' },
  { title: 'Product', key: 'product' },
  { title: 'Bucket', key: 'bucket' },
  { title: 'Amount', key: 'amount', align: 'end' as const },
  { title: 'Before', key: 'before', align: 'end' as const },
  { title: 'After', key: 'after', align: 'end' as const },
];

const rows = computed(() =>
  (logs.data.value?.items ?? []).map((e: AbmfEvent) => ({
    date: date(e.date),
    type: e.type ?? '—',
    subscriber: e.subscriber?.id ?? '—',
    product: e.product?.id ?? '—',
    bucket: e.bucketBalance?.id ?? '—',
    amount: fmtQuantity(e.amount),
    before: fmtQuantity(e.amountBefore),
    after: fmtQuantity(e.amountAfter),
    raw: e,
  })),
);

function clearFilters() {
  filterDate.value = '';
  filterType.value = '';
  filterSubscriber.value = '';
  filterBucket.value = '';
  filterUnits.value = '';
  filterProduct.value = '';
}
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <h1 class="text-h5 font-weight-medium">Balance log (ABMF)</h1>
      <v-spacer />
      <v-btn
        prepend-icon="mdi-filter-off"
        variant="text"
        size="small"
        :disabled="!filterDate && !filterType && !filterSubscriber && !filterBucket && !filterUnits && !filterProduct"
        @click="clearFilters"
      >
        Clear filters
      </v-btn>
      <v-btn prepend-icon="mdi-refresh" variant="tonal" @click="logs.reload">
        Refresh
      </v-btn>
    </div>

    <v-card>
      <v-card-text>
        <!-- Filter toolbar — mirrors the header fields of sig-balance-list.js. -->
        <div class="d-flex flex-wrap ga-3 mb-3">
          <v-text-field
            v-model="filterDate"
            label="Date"
            placeholder="YYYY-MM-DD"
            hint="Matches a prefix; e.g. 2026-04 returns the whole month."
            persistent-hint
            density="compact"
            clearable
            style="min-width: 180px"
          />
          <v-text-field
            v-model="filterType"
            label="Type"
            placeholder="topup / adjustment / deduct / reserve / transfer"
            density="compact"
            clearable
            style="min-width: 260px"
          />
          <v-text-field
            v-model="filterSubscriber"
            label="Subscriber"
            density="compact"
            clearable
            style="min-width: 180px"
          />
          <v-text-field
            v-model="filterProduct"
            label="Product"
            density="compact"
            clearable
            style="min-width: 180px"
          />
          <v-text-field
            v-model="filterBucket"
            label="Bucket"
            density="compact"
            clearable
            style="min-width: 180px"
          />
          <v-text-field
            v-model="filterUnits"
            label="Units"
            placeholder="cents / octets / seconds / messages"
            density="compact"
            clearable
            style="min-width: 220px"
          />
        </div>

        <v-data-table-server
          v-model:items-per-page="itemsPerPage"
          v-model:page="page"
          :items="rows"
          :items-length="total"
          :headers="headers"
          :loading="logs.loading.value"
          density="compact"
        >
          <template #item.type="{ item }">
            <v-chip size="small" :color="typeColor(item.type)">
              {{ item.type }}
            </v-chip>
          </template>
          <template #item.subscriber="{ item }">
            <code v-if="item.subscriber !== '—'" class="text-caption">
              {{ item.subscriber }}
            </code>
            <span v-else class="text-medium-emphasis">—</span>
          </template>
          <template #item.product="{ item }">
            <code v-if="item.product !== '—'" class="text-caption">
              {{ item.product }}
            </code>
            <span v-else class="text-medium-emphasis">—</span>
          </template>
          <template #item.bucket="{ item }">
            <code v-if="item.bucket !== '—'" class="text-caption">
              {{ item.bucket }}
            </code>
            <span v-else class="text-medium-emphasis">—</span>
          </template>
        </v-data-table-server>
      </v-card-text>
    </v-card>
  </div>
</template>
