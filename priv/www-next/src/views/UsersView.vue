<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { usersApi, type OcsUser } from '@/services';
import { useAsyncResource } from '@/composables/useAsyncResource';
import { useNotificationsStore } from '@/stores/notifications';
import UserFormDialog from '@/components/UserFormDialog.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';

const page = ref(1);
const itemsPerPage = ref(25);
const formDialog = ref<InstanceType<typeof UserFormDialog> | null>(null);
const confirmDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null);
const notifications = useNotificationsStore();

const range = computed(() => {
  const start = (page.value - 1) * itemsPerPage.value;
  return { start, end: start + itemsPerPage.value - 1 };
});

const users = useAsyncResource(() => usersApi.list(range.value.start, range.value.end));
watch([page, itemsPerPage], () => void users.reload());

const total = computed(
  () => users.data.value?.contentRange?.total ?? users.data.value?.total ?? 0,
);

function characteristic(user: OcsUser, name: string): string | undefined {
  const c = user.characteristic?.find((x) => x.name === name);
  return c ? String(c.value) : undefined;
}

const headers = [
  { title: 'Username', key: 'username' },
  { title: 'Locale', key: 'locale' },
  { title: 'Rating', key: 'rating' },
  { title: '', key: 'actions', sortable: false, align: 'end' as const, width: 80 },
];

const rows = computed(() =>
  (users.data.value?.items ?? []).map((u) => ({
    id: u.id,
    username: characteristic(u, 'username') ?? u.id,
    locale: characteristic(u, 'locale') ?? '—',
    rating: characteristic(u, 'rating') === 'true',
    raw: u,
  })),
);

async function remove(user: OcsUser) {
  const ok = await confirmDialog.value?.ask();
  if (!ok) return;
  try {
    await usersApi.delete(user.id);
    notifications.success('User deleted.');
    void users.reload();
  } catch {
    /* interceptor toasts */
  }
}
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <h1 class="text-h5 font-weight-medium">Users</h1>
      <v-spacer />
      <v-btn color="primary" prepend-icon="mdi-plus" @click="formDialog?.show()">Add user</v-btn>
    </div>

    <v-card>
      <v-card-text>
        <v-data-table-server
          v-model:items-per-page="itemsPerPage"
          v-model:page="page"
          :items="rows"
          :items-length="total"
          :headers="headers"
          :loading="users.loading.value"
          density="comfortable"
        >
          <template #item.rating="{ item }">
            <v-icon :icon="item.rating ? 'mdi-check-circle' : 'mdi-close-circle'"
                    :color="item.rating ? 'success' : 'default'" />
          </template>
          <template #item.actions="{ item }">
            <v-btn icon="mdi-delete" variant="text" size="small" color="error" @click="remove(item.raw)" />
          </template>
        </v-data-table-server>
      </v-card-text>
    </v-card>

    <UserFormDialog ref="formDialog" @saved="users.reload" />
    <ConfirmDialog
      ref="confirmDialog"
      title="Delete user"
      message="This will permanently remove the user. Continue?"
      confirm-text="Delete"
    />
  </div>
</template>
