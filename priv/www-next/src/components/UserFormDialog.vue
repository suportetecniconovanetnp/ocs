<script setup lang="ts">
import { ref } from 'vue';
import { usersApi, type UserFormInput } from '@/services';
import { useNotificationsStore } from '@/stores/notifications';

const open = ref(false);
const saving = ref(false);
const showPassword = ref(false);
const notifications = useNotificationsStore();

const emit = defineEmits<{ saved: [] }>();

const form = ref<UserFormInput>({
  username: '',
  password: '',
  locale: 'en',
  rating: false,
});

function show() {
  form.value = { username: '', password: '', locale: 'en', rating: false };
  open.value = true;
}

async function save() {
  if (!form.value.username || !form.value.password) {
    notifications.warning('Username and password are required.');
    return;
  }
  saving.value = true;
  try {
    await usersApi.create(form.value);
    notifications.success('User created.');
    emit('saved');
    open.value = false;
  } finally {
    saving.value = false;
  }
}

defineExpose({ show });
</script>

<template>
  <v-dialog v-model="open" max-width="480" persistent>
    <v-card>
      <v-card-title>Add user</v-card-title>
      <v-card-text>
        <v-text-field v-model="form.username" label="Username" autofocus class="mb-3" />
        <v-text-field
          v-model="form.password"
          label="Password"
          :type="showPassword ? 'text' : 'password'"
          :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
          class="mb-3"
          @click:append-inner="showPassword = !showPassword"
        />
        <v-select
          v-model="form.locale"
          :items="[
            { title: 'English', value: 'en' },
            { title: 'Spanish', value: 'es' },
          ]"
          label="Language"
          class="mb-3"
        />
        <v-switch v-model="form.rating" color="primary" label="Rating role" hide-details />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="saving" @click="open = false">Cancel</v-btn>
        <v-btn color="primary" :loading="saving" @click="save">Create</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
