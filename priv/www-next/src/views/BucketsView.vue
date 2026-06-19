<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { balanceApi } from '@/services';
import { useAsyncResource } from '@/composables/useAsyncResource';
import { useFormatters } from '@/composables/useFormatters';
import { useNotificationsStore } from '@/stores/notifications';
import TopupDialog from '@/components/TopupDialog.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import type { Bucket, Quantity } from '@/types/tmf';

const route = useRoute();
const page = ref(1);
const itemsPerPage = ref(25);
const filterProduct = ref((route.query.product as string) ?? '');
const topupDialog = ref<InstanceType<typeof TopupDialog> | null>(null);
const confirmDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null);
const notifications = useNotificationsStore();
const { date, bytes, duration, number, money } = useFormatters();

// Fetch the full collection in paged batches, then filter locally. The
// backend expects If-Range continuation headers after the first page.
const buckets = useAsyncResource(() => balanceApi.listAllBuckets());

// Reset page to 1 whenever the filter changes, debounced.
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(filterProduct, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
  }, 200);
});

const filtered = computed<Bucket[]>(() => {
  const all = buckets.data.value?.items ?? [];
  const needle = filterProduct.value.trim();
  if (!needle) return all;
  return all.filter((b) => (b.product?.id ?? '').includes(needle));
});

const total = computed(() => filtered.value.length);

const paginated = computed(() => {
  if (itemsPerPage.value === -1) return filtered.value;
  const start = (page.value - 1) * itemsPerPage.value;
  return filtered.value.slice(start, start + itemsPerPage.value);
});

const headers = [
  { title: 'ID', key: 'id' },
  { title: 'Product', key: 'product' },
  { title: 'Units', key: 'units' },
  { title: 'Remaining', key: 'remaining' },
  { title: 'Price', key: 'price' },
  { title: 'Valid from', key: 'validFrom' },
  { title: 'Valid to', key: 'validTo' },
  { title: '', key: 'actions', sortable: false, align: 'end' as const, width: 80 },
];

/**
 * SigScale buckets store amounts as strings with a unit suffix:
 * `"1500b"` (octets), `"60s"` (seconds), `"10msg"` (messages),
 * or a plain number for cents. Strip the suffix and return the raw number.
 */
function parseAmount(q: Quantity | undefined): number | undefined {
  if (!q || q.amount == null) return undefined;
  if (typeof q.amount === 'number') return q.amount;
  const stripped = q.amount.replace(/(b|s|msg)$/i, '');
  const n = Number(stripped);
  return Number.isFinite(n) ? n : undefined;
}

function formatRemaining(q: Quantity | undefined): string {
  const value = parseAmount(q);
  if (value == null) return '—';
  switch (q?.units) {
    case 'cents':
      return money(value / 100);
    case 'octets':
      return bytes(value);
    case 'seconds':
      return duration(value);
    case 'messages':
      return `${number(value)} msg`;
    default:
      return number(value);
  }
}

const rows = computed(() =>
  paginated.value.map((bucket) => ({
    id: bucket.id,
    product: bucket.product?.id ?? '—',
    units: bucket.remainedAmount?.units ?? '—',
    remaining: formatRemaining(bucket.remainedAmount),
    price:
      bucket.price?.taxIncludedAmount != null
        ? money(bucket.price.taxIncludedAmount, bucket.price.currencyCode)
        : '—',
    validFrom: date(bucket.validFor?.startDateTime),
    validTo: date(bucket.validFor?.endDateTime),
    raw: bucket,
  })),
);

async function remove(bucket: Bucket) {
  const ok = await confirmDialog.value?.ask();
  if (!ok) return;
  try {
    await balanceApi.deleteBucket(bucket.id);
    notifications.success('Bucket deleted.');
    void buckets.reload();
  } catch {
    /* interceptor toasts */
  }
}
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <h1 class="text-h5 font-weight-medium">Buckets</h1>
      <v-spacer />
      <v-btn color="primary" prepend-icon="mdi-cash-plus" @click="topupDialog?.show()">
        Top-up / adjustment
      </v-btn>
    </div>

    <v-card>
      <v-card-text>
        <v-text-field
          v-model="filterProduct"
          prepend-inner-icon="mdi-magnify"
          placeholder="Filter by product ID (client-side substring match)"
          clearable
          :hint="`Showing ${total} of ${buckets.data.value?.items.length ?? 0} fetched (client-side filter).`"
          persistent-hint
          class="mb-3"
        />
        <v-data-table-server
          v-model:items-per-page="itemsPerPage"
          v-model:page="page"
          :items="rows"
          :items-length="total"
          :headers="headers"
          :loading="buckets.loading.value"
          density="comfortable"
        >
          <template #item.units="{ item }">
            <v-chip size="x-small">{{ item.units }}</v-chip>
          </template>
          <template #item.actions="{ item }">
            <v-btn icon="mdi-delete" variant="text" size="small" color="error" @click="remove(item.raw)" />
          </template>
        </v-data-table-server>
      </v-card-text>
    </v-card>

    <TopupDialog ref="topupDialog" @done="buckets.reload" />
    <ConfirmDialog
      ref="confirmDialog"
      title="Delete bucket"
      message="This will permanently remove the bucket. Continue?"
      confirm-text="Delete"
    />
  </div>
</template>
