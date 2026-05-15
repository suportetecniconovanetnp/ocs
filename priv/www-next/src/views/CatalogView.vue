<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { catalogApi } from '@/services';
import { useAsyncResource } from '@/composables/useAsyncResource';
import { useNotificationsStore } from '@/stores/notifications';
import OfferingFormDialog from '@/components/OfferingFormDialog.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import type { ProductOffering } from '@/types/tmf';

const router = useRouter();
const notifications = useNotificationsStore();

const page = ref(1);
const itemsPerPage = ref(25);
const editing = ref<ProductOffering | null>(null);
const formDialog = ref<InstanceType<typeof OfferingFormDialog> | null>(null);
const confirmDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null);

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
  { title: '', key: 'actions', sortable: false, align: 'end' as const, width: 160 },
];

function openDetail(item: ProductOffering) {
  router.push({ name: 'offering-detail', params: { id: item.id } });
}

function add() {
  editing.value = null;
  formDialog.value?.show();
}

function edit(item: ProductOffering) {
  // SigScale's list endpoint returns full offerings (prices + chars),
  // and there's no GET-by-id route, so we open the dialog with the row data.
  editing.value = item;
  formDialog.value?.show();
}

async function remove(item: ProductOffering) {
  const ok = await confirmDialog.value?.ask();
  if (!ok) return;
  try {
    await catalogApi.deleteOffering(item);
    notifications.success('Offering deleted.');
    void offerings.reload();
  } catch {
    /* interceptor toasts */
  }
}
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <h1 class="text-h5 font-weight-medium">Catalog — Offerings</h1>
      <v-spacer />
      <v-btn color="primary" prepend-icon="mdi-plus" @click="add">Add offering</v-btn>
    </div>

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
          <template #item.actions="{ item }">
            <v-btn icon="mdi-eye" variant="text" size="small" @click="openDetail(item)" />
            <v-btn icon="mdi-pencil" variant="text" size="small" @click="edit(item)" />
            <v-btn icon="mdi-delete" variant="text" size="small" color="error" @click="remove(item)" />
          </template>
        </v-data-table-server>
      </v-card-text>
    </v-card>

    <OfferingFormDialog ref="formDialog" :offering="editing" @saved="offerings.reload" />
    <ConfirmDialog
      ref="confirmDialog"
      title="Delete offering"
      message="This will permanently remove the offering. Continue?"
      confirm-text="Delete"
    />
  </div>
</template>
