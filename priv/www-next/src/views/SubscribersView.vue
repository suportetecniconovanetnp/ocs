<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { subscribersApi } from '@/services';
import { useAsyncResource } from '@/composables/useAsyncResource';
import type { Service } from '@/types/tmf';

const { t } = useI18n();

const page = ref(1);
const itemsPerPage = ref(25);
const search = ref('');
const expanded = ref<string[]>([]);

const range = computed(() => {
  const start = (page.value - 1) * itemsPerPage.value;
  const end = start + itemsPerPage.value - 1;
  return { start, end };
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
  { title: 'Characteristics', key: 'serviceCharacteristic', sortable: false },
  { title: '', key: 'data-table-expand', width: 56 },
];

function characteristicSummary(svc: Service): string {
  const items = svc.serviceCharacteristic ?? [];
  return items
    .slice(0, 3)
    .map((c) => `${c.name}=${String(c.value)}`)
    .join(', ');
}

function safeT(key: string, fallback: string): string {
  const out = t(key);
  return out === key ? fallback : out;
}
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <h1 class="text-h5 font-weight-medium">{{ safeT('subs', 'Subscribers') }}</h1>
      <v-spacer />
      <v-btn color="primary" prepend-icon="mdi-plus" disabled>
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
          <template #item.serviceCharacteristic="{ item }">
            <span class="text-caption">{{ characteristicSummary(item) }}</span>
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
                    <tr
                      v-for="c in item.serviceCharacteristic ?? []"
                      :key="c.name"
                    >
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
  </div>
</template>
