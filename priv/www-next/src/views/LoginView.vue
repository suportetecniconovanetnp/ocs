<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useNotificationsStore } from '@/stores/notifications';
import { probeConnection } from '@/services/http';

const auth = useAuthStore();
const notifications = useNotificationsStore();
const router = useRouter();
const route = useRoute();

const baseUrl = ref(auth.baseUrl || (import.meta.env.VITE_OCS_API_URL ?? ''));
const username = ref(auth.username);
const password = ref(auth.password);
const showPassword = ref(false);
const testing = ref(false);

async function testConnection(): Promise<boolean> {
  if (!baseUrl.value || !username.value || !password.value) {
    notifications.warning('Fill base URL, username and password first.');
    return false;
  }
  testing.value = true;
  try {
    const result = await probeConnection(baseUrl.value, username.value, password.value);
    if (result.ok) {
      notifications.success('Connection OK.');
      return true;
    }
    notifications.error(`Connection failed: ${result.message} (${result.status})`);
    return false;
  } finally {
    testing.value = false;
  }
}

async function connect() {
  const ok = await testConnection();
  if (!ok) return;
  auth.setBaseUrl(baseUrl.value);
  auth.setCredentials(username.value, password.value);
  const redirect = (route.query.redirect as string) || '/';
  router.replace(redirect);
}
</script>

<template>
  <v-container class="d-flex align-center justify-center" style="min-height: 100vh">
    <v-card width="440" class="pa-2" elevation="6">
      <v-card-item>
        <template #prepend>
          <v-avatar color="primary" size="40">
            <v-icon icon="mdi-shield-account" color="white" />
          </v-avatar>
        </template>
        <v-card-title>SigScale OCS</v-card-title>
        <v-card-subtitle>Connect to your OCS instance</v-card-subtitle>
      </v-card-item>

      <v-card-text>
        <v-form @submit.prevent="connect">
          <v-text-field
            v-model="baseUrl"
            label="Base URL"
            placeholder="http://localhost:8080"
            prepend-inner-icon="mdi-link-variant"
            autocomplete="url"
            class="mb-3"
            :rules="[(v) => !!v || 'Required', (v) => /^https?:\/\//.test(v) || 'Must start with http(s)://']"
          />
          <v-text-field
            v-model="username"
            label="Username"
            prepend-inner-icon="mdi-account"
            autocomplete="username"
            class="mb-3"
            :rules="[(v) => !!v || 'Required']"
          />
          <v-text-field
            v-model="password"
            label="Password"
            prepend-inner-icon="mdi-lock"
            :type="showPassword ? 'text' : 'password'"
            :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
            autocomplete="current-password"
            class="mb-1"
            :rules="[(v) => !!v || 'Required']"
            @click:append-inner="showPassword = !showPassword"
          />

          <div class="d-flex align-center mt-4 ga-2">
            <v-btn
              variant="tonal"
              color="primary"
              :loading="testing"
              prepend-icon="mdi-lan-connect"
              @click="testConnection"
            >
              Test
            </v-btn>
            <v-spacer />
            <v-btn
              type="submit"
              color="primary"
              :loading="testing"
              append-icon="mdi-arrow-right"
            >
              Connect
            </v-btn>
          </div>
        </v-form>
      </v-card-text>

      <v-divider />
      <v-card-text class="text-caption text-medium-emphasis">
        Credentials are kept in <code>sessionStorage</code> (cleared when the tab closes).
        The base URL is remembered in <code>localStorage</code>.
        In <code>npm run dev</code> the Vite proxy forwards requests to the chosen
        backend, so CORS doesn't need to be enabled there.
      </v-card-text>
    </v-card>
  </v-container>
</template>
