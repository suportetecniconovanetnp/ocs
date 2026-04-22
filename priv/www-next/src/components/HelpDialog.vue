<script setup lang="ts">
import { ref } from 'vue';
import { useAuthStore } from '@/stores/auth';

const open = ref(false);
const auth = useAuthStore();

function show() {
  open.value = true;
}

defineExpose({ show });
</script>

<template>
  <v-dialog v-model="open" max-width="540">
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon icon="mdi-information-outline" color="primary" class="mr-2" />
        About SigScale OCS
      </v-card-title>
      <v-card-text>
        <p class="mb-3">
          Online Charging System (OCS) — modernised web UI built with Vue 3, Vuetify 3 and Vite.
        </p>
        <v-table density="compact">
          <tbody>
            <tr>
              <th class="text-left">UI version</th>
              <td>0.1 (next)</td>
            </tr>
            <tr>
              <th class="text-left">Backend</th>
              <td><code>{{ auth.baseUrl || '(same origin)' }}</code></td>
            </tr>
            <tr>
              <th class="text-left">Authenticated as</th>
              <td><code>{{ auth.username || '—' }}</code></td>
            </tr>
            <tr>
              <th class="text-left">Documentation</th>
              <td>
                <a href="https://sigscale.org/" target="_blank" rel="noopener noreferrer">
                  sigscale.org
                </a>
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="open = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
