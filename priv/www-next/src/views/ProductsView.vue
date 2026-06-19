<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { productsApi } from '@/services';
import { useAsyncResource } from '@/composables/useAsyncResource';
import { useFormatters } from '@/composables/useFormatters';
import { useNotificationsStore } from '@/stores/notifications';
import TopupDialog from '@/components/TopupDialog.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import type { Product, Quantity } from '@/types/tmf';

const router = useRouter();
const notifications = useNotificationsStore();
const { date, bytes, duration, number, money } = useFormatters();

const page = ref(1);
const itemsPerPage = ref(25);
const filterText = ref('');
const topupDialog = ref<InstanceType<typeof TopupDialog> | null>(null);
const confirmDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null);

// Fetch the full collection in paged batches, then filter locally. The
// backend expects If-Range continuation headers after the first page.
const products = useAsyncResource(() => productsApi.listAll());

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(filterText, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
  }, 200);
});

/* Match against id, productOffering name, or any realizingService id. */
function matches(p: Product, needle: string): boolean {
  if (!needle) return true;
  const n = needle.toLowerCase();
  if (p.id?.toLowerCase().includes(n)) return true;
  if (p.productOffering?.name?.toLowerCase().includes(n)) return true;
  if (p.productOffering?.id?.toLowerCase().includes(n)) return true;
  return Boolean(p.realizingService?.some((s) => s.id.toLowerCase().includes(n)));
}

const filtered = computed<Product[]>(() => {
  const all = products.data.value?.items ?? [];
  return all.filter((p) => matches(p, filterText.value.trim()));
});

const total = computed(() => filtered.value.length);

const paginated = computed(() => {
  if (itemsPerPage.value === -1) return filtered.value;
  const start = (page.value - 1) * itemsPerPage.value;
  return filtered.value.slice(start, start + itemsPerPage.value);
});

/* ---- Helpers to format the per-units balance shown by the legacy ---- */

function balanceFor(product: Product, units: Quantity['units']): Quantity | undefined {
  return product.balance?.find((b) => b.totalBalance?.units === units)?.totalBalance;
}

function parseAmount(q: Quantity | undefined): number | undefined {
  if (!q || q.amount == null) return undefined;
  if (typeof q.amount === 'number') return q.amount;
  const stripped = q.amount.replace(/(b|s|msg)$/i, '');
  const n = Number(stripped);
  return Number.isFinite(n) ? n : undefined;
}

function fmtBalance(product: Product, units: Quantity['units']): string {
  const value = parseAmount(balanceFor(product, units));
  if (value == null) return '—';
  switch (units) {
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

/* ---- Status colour mapping (legacy entityClass → Vuetify chip colour) ---- */

const STATUS_COLORS: Record<string, string> = {
  active: 'success',
  Active: 'success',
  created: 'info',
  Created: 'info',
  pendingActive: 'warning',
  'Pending Active': 'warning',
  pendingTerminate: 'warning',
  'Pending Terminate': 'warning',
  suspended: 'warning',
  Suspended: 'warning',
  cancelled: 'error',
  Cancelled: 'error',
  terminated: 'error',
  Terminated: 'error',
  aborted: 'error',
  Aborted: 'error',
};

function statusColor(status: string | undefined): string {
  return status ? (STATUS_COLORS[status] ?? 'default') : 'default';
}

const headers = [
  { title: 'Product ID', key: 'id' },
  { title: 'Offering', key: 'offering' },
  { title: 'Services', key: 'services' },
  { title: 'Status', key: 'status' },
  { title: 'Cents', key: 'cents', align: 'end' as const },
  { title: 'Bytes', key: 'bytes', align: 'end' as const },
  { title: 'Seconds', key: 'seconds', align: 'end' as const },
  { title: 'Start', key: 'startDate' },
  { title: 'End', key: 'endDate' },
  { title: '', key: 'actions', sortable: false, align: 'end' as const, width: 200 },
];

const rows = computed(() =>
  paginated.value.map((p) => ({
    id: p.id,
    offering: p.productOffering?.name ?? p.productOffering?.id ?? '—',
    services: (p.realizingService ?? []).map((s) => s.id),
    status: p.status ?? '—',
    cents: fmtBalance(p, 'cents'),
    bytes: fmtBalance(p, 'octets'),
    seconds: fmtBalance(p, 'seconds'),
    startDate: date(p.startDate),
    endDate: date(p.terminationDate),
    raw: p,
  })),
);

function topup(product: Product) {
  topupDialog.value?.show(product.id);
}

function viewBuckets(product: Product) {
  router.push({ name: 'buckets', query: { product: product.id } });
}

const pendingDelete = ref<Product | null>(null);
const deleteMessage = computed(() => {
  const p = pendingDelete.value;
  if (!p) return '';
  const services = (p.realizingService ?? []).map((s) => s.id).join(', ');
  if (services) {
    return `This will permanently remove product "${p.id}" along with its buckets. The realizing service(s) [${services}] will be left orphaned. Continue?`;
  }
  return `This will permanently remove product "${p.id}" along with its buckets. Continue?`;
});

async function remove(product: Product) {
  pendingDelete.value = product;
  const ok = await confirmDialog.value?.ask();
  pendingDelete.value = null;
  if (!ok) return;
  try {
    await productsApi.delete(product.id);
    notifications.success(`Product ${product.id} deleted.`);
    void products.reload();
  } catch {
    /* interceptor toasts */
  }
}
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <h1 class="text-h5 font-weight-medium">Products</h1>
      <v-spacer />
      <v-btn prepend-icon="mdi-refresh" variant="tonal" @click="products.reload">
        Refresh
      </v-btn>
    </div>

    <v-card>
      <v-card-text>
        <v-text-field
          v-model="filterText"
          prepend-inner-icon="mdi-magnify"
          placeholder="Filter by product ID, offering or service identity"
          clearable
          :hint="`Showing ${total} of ${products.data.value?.items.length ?? 0} fetched (client-side filter).`"
          persistent-hint
          class="mb-3"
        />
        <v-data-table-server
          v-model:items-per-page="itemsPerPage"
          v-model:page="page"
          :items="rows"
          :items-length="total"
          :headers="headers"
          :loading="products.loading.value"
          density="compact"
        >
          <template #item.id="{ item }">
            <code class="text-caption">{{ item.id }}</code>
          </template>

          <template #item.offering="{ item }">
            <span class="text-caption">{{ item.offering }}</span>
          </template>

          <template #item.services="{ item }">
            <div v-if="item.services.length" class="d-flex flex-wrap ga-1">
              <v-chip
                v-for="s in item.services"
                :key="s"
                size="x-small"
                variant="tonal"
              >
                {{ s }}
              </v-chip>
            </div>
            <span v-else class="text-medium-emphasis">—</span>
          </template>

          <template #item.status="{ item }">
            <v-chip size="small" :color="statusColor(item.status)">
              {{ item.status }}
            </v-chip>
          </template>

          <template #item.actions="{ item }">
            <v-btn
              icon="mdi-cash-plus"
              variant="text"
              size="small"
              title="Top-up / adjustment"
              @click="topup(item.raw)"
            />
            <v-btn
              icon="mdi-wallet"
              variant="text"
              size="small"
              title="View buckets"
              @click="viewBuckets(item.raw)"
            />
            <v-btn
              icon="mdi-delete"
              variant="text"
              size="small"
              color="error"
              title="Delete product"
              @click="remove(item.raw)"
            />
          </template>
        </v-data-table-server>
      </v-card-text>
    </v-card>

    <TopupDialog ref="topupDialog" @done="products.reload" />
    <ConfirmDialog
      ref="confirmDialog"
      title="Delete product"
      :message="deleteMessage"
      confirm-text="Delete"
    />
  </div>
</template>
