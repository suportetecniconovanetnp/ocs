<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { balanceApi } from '@/services';
import { useAsyncResource } from '@/composables/useAsyncResource';
import { useFormatters } from '@/composables/useFormatters';
import { useNotificationsStore } from '@/stores/notifications';
import TopupDialog from '@/components/TopupDialog.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import type { Bucket } from '@/types/tmf';

const page = ref(1);
const itemsPerPage = ref(25);
const filterProduct = ref('');
const topupDialog = ref<InstanceType<typeof TopupDialog> | null>(null);
const confirmDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null);
const notifications = useNotificationsStore();
const { date, bytes, number } = useFormatters();

const range = computed(() => {
  const start = (page.value - 1) * itemsPerPage.value;
  return { start, end: start + itemsPerPage.value - 1 };
});

const buckets = useAsyncResource(() =>
  balanceApi.listBuckets(filterProduct.value || undefined, range.value.start, range.value.end),
);
watch([page, itemsPerPage], () => void buckets.reload());

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(filterProduct, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
    void buckets.reload();
  }, 400);
});

const total = computed(
  () => buckets.data.value?.contentRange?.total ?? buckets.data.value?.total ?? 0,
);

const headers = [
  { title: 'ID', key: 'id' },
  { title: 'Product', key: 'product' },
  { title: 'Units', key: 'units' },
  { title: 'Amount', key: 'amount' },
  { title: 'Remaining', key: 'remainedAmount' },
  { title: 'Valid from', key: 'validFrom' },
  { title: 'Valid to', key: 'validTo' },
  { title: '', key: 'actions', sortable: false, align: 'end' as const, width: 80 },
];

function row(bucket: Bucket) {
  const units = bucket.amount?.units;
  const amt = bucket.amount?.amount;
  const rem = bucket.remainedAmount?.amount;
  const isBytes = units === 'octets';
  return {
    id: bucket.id,
    product: bucket.product?.id,
    units: units ?? '—',
    amount: isBytes ? bytes(amt) : number(amt ?? null),
    remainedAmount: isBytes ? bytes(rem) : number(rem ?? null),
    validFrom: date(bucket.validFor?.startDateTime),
    validTo: date(bucket.validFor?.endDateTime),
    raw: bucket,
  };
}

const rows = computed(() => (buckets.data.value?.items ?? []).map(row));

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
          placeholder="Filter by product ID"
          clearable
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
