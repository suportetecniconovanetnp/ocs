<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { clientsApi } from '@/services';
import { useAsyncResource } from '@/composables/useAsyncResource';
import { useNotificationsStore } from '@/stores/notifications';
import ClientFormDialog from '@/components/ClientFormDialog.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import type { Client } from '@/types/tmf';

const page = ref(1);
const itemsPerPage = ref(25);
const formDialog = ref<InstanceType<typeof ClientFormDialog> | null>(null);
const confirmDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null);
const editing = ref<Client | null>(null);
const notifications = useNotificationsStore();

const range = computed(() => {
  const start = (page.value - 1) * itemsPerPage.value;
  return { start, end: start + itemsPerPage.value - 1 };
});

const clients = useAsyncResource(() => clientsApi.list(range.value.start, range.value.end));
watch([page, itemsPerPage], () => void clients.reload());

const total = computed(
  () => clients.data.value?.contentRange?.total ?? clients.data.value?.total ?? 0,
);

const headers = [
  { title: 'Identifier', key: 'identifier' },
  { title: 'Protocol', key: 'protocol' },
  { title: 'Port', key: 'port' },
  { title: 'Trusted', key: 'trusted' },
  { title: '', key: 'actions', sortable: false, align: 'end' as const, width: 120 },
];

function add() {
  editing.value = null;
  formDialog.value?.show();
}

function edit(client: Client) {
  editing.value = client;
  formDialog.value?.show();
}

async function remove(client: Client) {
  const ok = await confirmDialog.value?.ask();
  if (!ok) return;
  try {
    await clientsApi.delete(client.id);
    notifications.success('Client deleted.');
    void clients.reload();
  } catch {
    /* error already toasted by interceptor */
  }
}
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <h1 class="text-h5 font-weight-medium">Clients</h1>
      <v-spacer />
      <v-btn color="primary" prepend-icon="mdi-plus" @click="add">Add client</v-btn>
    </div>

    <v-card>
      <v-card-text>
        <v-data-table-server
          v-model:items-per-page="itemsPerPage"
          v-model:page="page"
          :items="clients.data.value?.items ?? []"
          :items-length="total"
          :headers="headers"
          :loading="clients.loading.value"
          density="comfortable"
        >
          <template #item.trusted="{ item }">
            <v-icon
              :icon="item.trusted ? 'mdi-shield-check' : 'mdi-shield-off-outline'"
              :color="item.trusted ? 'success' : 'warning'"
            />
          </template>
          <template #item.actions="{ item }">
            <v-btn icon="mdi-pencil" variant="text" size="small" @click="edit(item)" />
            <v-btn icon="mdi-delete" variant="text" size="small" color="error" @click="remove(item)" />
          </template>
        </v-data-table-server>
      </v-card-text>
    </v-card>

    <ClientFormDialog ref="formDialog" :client="editing" @saved="clients.reload" />
    <ConfirmDialog
      ref="confirmDialog"
      title="Delete client"
      message="This will permanently remove the client. Continue?"
      confirm-text="Delete"
    />
  </div>
</template>
