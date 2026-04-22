<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { catalogApi } from '@/services';
import { useAsyncResource } from '@/composables/useAsyncResource';

const page = ref(1);
const itemsPerPage = ref(25);

const range = computed(() => {
  const start = (page.value - 1) * itemsPerPage.value;
  return { start, end: start + itemsPerPage.value - 1 };
});

const offerings = useAsyncResource(() =>
  catalogApi.listOfferings(range.value.start, range.value.end),
);
watch([page, itemsPerPage], () => void offerings.reload());

const total = computed(
  () => offerings.data.value?.contentRange?.total ?? offerings.data.value?.total ?? 0,
);

const headers = [
  { title: 'Name', key: 'name' },
  { title: 'Status', key: 'lifecycleStatus' },
  { title: 'Bundle', key: 'isBundle' },
  { title: 'Description', key: 'description', sortable: false },
];
</script>

<template>
  <div>
    <h1 class="text-h5 font-weight-medium mb-4">Catalog — Offerings</h1>
    <v-card>
      <v-card-text>
        <v-data-table-server
          v-model:items-per-page="itemsPerPage"
          v-model:page="page"
          :items="offerings.data.value?.items ?? []"
          :items-length="total"
          :headers="headers"
          :loading="offerings.loading.value"
          density="comfortable"
        >
          <template #item.lifecycleStatus="{ item }">
            <v-chip size="small" :color="item.lifecycleStatus === 'Active' ? 'success' : 'default'">
              {{ item.lifecycleStatus ?? '—' }}
            </v-chip>
          </template>
          <template #item.isBundle="{ item }">
            <v-icon
              :icon="item.isBundle ? 'mdi-package-variant-closed' : 'mdi-package-variant'"
              size="small"
            />
          </template>
        </v-data-table-server>
      </v-card-text>
    </v-card>
  </div>
</template>
