<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { subscribersApi } from '@/services';
import { useAsyncResource } from '@/composables/useAsyncResource';
import { useNotificationsStore } from '@/stores/notifications';
import { useSafeT } from '@/composables/useSafeT';
import SubscriberFormDialog from '@/components/SubscriberFormDialog.vue';
import SubscriberTrafficDialog from '@/components/SubscriberTrafficDialog.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import type { Service } from '@/types/tmf';

const { safeT } = useSafeT();
const notifications = useNotificationsStore();
const router = useRouter();

const page = ref(1);
const itemsPerPage = ref(25);
const search = ref('');
const expanded = ref<string[]>([]);
const editing = ref<Service | null>(null);
const formDialog = ref<InstanceType<typeof SubscriberFormDialog> | null>(null);
const trafficDialog = ref<InstanceType<typeof SubscriberTrafficDialog> | null>(null);
const confirmDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null);

const range = computed(() => {
  const start = (page.value - 1) * itemsPerPage.value;
  return { start, end: start + itemsPerPage.value - 1 };
});

const subscribers = useAsyncResource(() =>
  subscribersApi.list(range.value.start, range.value.end, search.value || undefined),
);

watch([page, itemsPerPage], () => void subscribers.reload());

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
    void subscribers.reload();
  }, 300);
});

const total = computed(
  () => subscribers.data.value?.contentRange?.total ?? subscribers.data.value?.total ?? 0,
);

const headers = [
  { title: 'ID', key: 'id', sortable: false },
  { title: 'State', key: 'state' },
  { title: 'Enabled', key: 'isServiceEnabled' },
  { title: 'Product', key: 'product', sortable: false },
  { title: 'Password', key: 'password', sortable: false },
  { title: 'Multi-session', key: 'multisession', sortable: false },
  { title: 'Other', key: 'extras', sortable: false },
  { title: '', key: 'actions', sortable: false, align: 'end' as const, width: 200 },
  { title: '', key: 'data-table-expand', width: 56 },
];

// Characteristics surfaced as their own columns; everything else falls into "Other".
const KNOWN_CHARS = new Set(['serviceIdentity', 'servicePassword', 'multisession']);

function lookup(svc: Service, name: string): string | undefined {
  const c = svc.serviceCharacteristic?.find((x) => x.name === name);
  return c == null ? undefined : String(c.value);
}

function extras(svc: Service): { name: string; value: string }[] {
  return (svc.serviceCharacteristic ?? [])
    .filter((c) => !KNOWN_CHARS.has(c.name))
    .map((c) => ({ name: c.name, value: String(c.value) }));
}

function productIdFromService(svc: Service): string | undefined {
  // SigScale exposes the product link as a flat string on the Service
  // (newer responses use `product`, legacy ones used `productId`).
  return svc.product || svc.productId || undefined;
}

function viewBuckets(svc: Service) {
  const productId = productIdFromService(svc);
  if (!productId) {
    notifications.warning('This subscriber has no associated product.');
    return;
  }
  router.push({ name: 'buckets', query: { product: productId } });
}

// Traffic history: filter accounting logs by the subscriber's serviceIdentity
// (falls back to the service id when not set in characteristics).
function viewTraffic(svc: Service) {
  const identity = lookup(svc, 'serviceIdentity') || svc.id;
  trafficDialog.value?.show(identity);
}


function add() {
  editing.value = null;
  formDialog.value?.show();
}

function edit(svc: Service) {
  editing.value = svc;
  formDialog.value?.show();
}

async function remove(svc: Service) {
  const ok = await confirmDialog.value?.ask();
  if (!ok) return;
  try {
    await subscribersApi.delete(svc.id);
    notifications.success('Subscriber deleted.');
    void subscribers.reload();
  } catch {
    /* interceptor toasts */
  }
}
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <h1 class="text-h5 font-weight-medium">{{ safeT('subs', 'Subscribers') }}</h1>
      <v-spacer />
      <v-btn color="primary" prepend-icon="mdi-plus" @click="add">
        {{ safeT('add', 'Add') }}
      </v-btn>
    </div>

    <v-card>
      <v-card-text>
        <v-text-field
          v-model="search"
          prepend-inner-icon="mdi-magnify"
          :placeholder="safeT('search', 'Search by identity')"
          clearable
          class="mb-3"
        />
        <v-data-table-server
          v-model:items-per-page="itemsPerPage"
          v-model:page="page"
          v-model:expanded="expanded"
          :items="subscribers.data.value?.items ?? []"
          :items-length="total"
          :headers="headers"
          :loading="subscribers.loading.value"
          item-value="id"
          show-expand
          density="comfortable"
        >
          <template #item.isServiceEnabled="{ item }">
            <v-icon
              :icon="item.isServiceEnabled ? 'mdi-check-circle' : 'mdi-close-circle'"
              :color="item.isServiceEnabled ? 'success' : 'error'"
            />
          </template>
          <template #item.state="{ item }">
            <v-chip size="small" :color="item.state === 'active' ? 'success' : 'default'">
              {{ item.state ?? '—' }}
            </v-chip>
          </template>
          <template #item.product="{ item }">
            <code v-if="productIdFromService(item)" class="text-caption">
              {{ productIdFromService(item) }}
            </code>
            <span v-else class="text-medium-emphasis">—</span>
          </template>
          <template #item.password="{ item }">
            <code v-if="lookup(item, 'servicePassword')" class="text-caption">
              {{ lookup(item, 'servicePassword') }}
            </code>
            <span v-else class="text-medium-emphasis">—</span>
          </template>
          <template #item.multisession="{ item }">
            <v-icon
              v-if="lookup(item, 'multisession') === 'true'"
              icon="mdi-check-circle"
              color="success"
              size="small"
            />
            <v-icon
              v-else-if="lookup(item, 'multisession') === 'false'"
              icon="mdi-close-circle"
              color="default"
              size="small"
            />
            <span v-else class="text-medium-emphasis">—</span>
          </template>
          <template #item.extras="{ item }">
            <div class="d-flex flex-wrap ga-1">
              <v-chip
                v-for="c in extras(item)"
                :key="c.name"
                size="x-small"
                variant="tonal"
                :title="`${c.name}: ${c.value}`"
              >
                <span class="text-caption font-weight-medium mr-1">{{ c.name }}</span>
                <span class="text-caption">{{ c.value }}</span>
              </v-chip>
              <span v-if="!extras(item).length" class="text-medium-emphasis">—</span>
            </div>
          </template>
          <template #item.actions="{ item }">
            <v-btn
              icon="mdi-chart-timeline-variant"
              variant="text"
              size="small"
              title="Traffic history"
              @click="viewTraffic(item)"
            />
            <v-btn
              icon="mdi-wallet"
              variant="text"
              size="small"
              :title="productIdFromService(item) ? 'View buckets' : 'No product associated'"
              :disabled="!productIdFromService(item)"
              @click="viewBuckets(item)"
            />
            <v-btn icon="mdi-pencil" variant="text" size="small" @click="edit(item)" />
            <v-btn icon="mdi-delete" variant="text" size="small" color="error" @click="remove(item)" />
          </template>
          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-3">
                <div class="text-caption text-medium-emphasis mb-2">
                  Service ID: <code>{{ item.id }}</code>
                </div>
                <v-table density="compact" class="mb-0">
                  <thead>
                    <tr>
                      <th>Characteristic</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in item.serviceCharacteristic ?? []" :key="c.name">
                      <td>{{ c.name }}</td>
                      <td><code>{{ String(c.value) }}</code></td>
                    </tr>
                    <tr v-if="!(item.serviceCharacteristic ?? []).length">
                      <td colspan="2" class="text-medium-emphasis">No characteristics.</td>
                    </tr>
                  </tbody>
                </v-table>
              </td>
            </tr>
          </template>
        </v-data-table-server>
      </v-card-text>
    </v-card>

    <SubscriberFormDialog ref="formDialog" :subscriber="editing" @saved="subscribers.reload" />
    <SubscriberTrafficDialog ref="trafficDialog" />
    <ConfirmDialog
      ref="confirmDialog"
      title="Delete subscriber"
      message="This will permanently remove the subscriber. Continue?"
      confirm-text="Delete"
    />
  </div>
</template>
