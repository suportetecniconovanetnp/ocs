<script setup lang="ts">
import { ref, watch } from 'vue';
import { clientsApi } from '@/services';
import { useNotificationsStore } from '@/stores/notifications';
import type { Client } from '@/types/tmf';

interface Props {
  client?: Client | null;
}

const props = withDefaults(defineProps<Props>(), { client: null });
const emit = defineEmits<{ saved: [Client] }>();

const open = ref(false);
const saving = ref(false);
const notifications = useNotificationsStore();

const form = ref<Partial<Client>>({
  identifier: '',
  protocol: 'RADIUS',
  port: 3799,
  secret: '',
  trusted: true,
  passwordRequired: true,
});

watch(
  () => props.client,
  (next) => {
    if (next) {
      form.value = { ...next };
    } else {
      form.value = {
        identifier: '',
        protocol: 'RADIUS',
        port: 3799,
        secret: '',
        trusted: true,
        passwordRequired: true,
      };
    }
  },
  { immediate: true },
);

function show() {
  open.value = true;
}

async function save() {
  if (!form.value.identifier) {
    notifications.warning('Identifier is required.');
    return;
  }
  saving.value = true;
  try {
    const payload: Partial<Client> = {
      id: form.value.identifier,
      identifier: form.value.identifier,
      protocol: form.value.protocol,
      trusted: form.value.trusted,
    };
    if (form.value.protocol === 'RADIUS') {
      payload.port = Number(form.value.port);
      payload.secret = form.value.secret;
      payload.passwordRequired = form.value.passwordRequired;
    }
    const result = props.client
      ? await clientsApi.update(props.client.id, payload)
      : await clientsApi.create(payload);
    notifications.success(props.client ? 'Client updated.' : 'Client created.');
    emit('saved', result);
    open.value = false;
  } finally {
    saving.value = false;
  }
}

defineExpose({ show });
</script>

<template>
  <v-dialog v-model="open" max-width="520" persistent>
    <v-card>
      <v-card-title>{{ client ? 'Edit client' : 'Add client' }}</v-card-title>
      <v-card-text>
        <v-text-field
          v-model="form.identifier"
          label="Identifier (IP / FQDN)"
          :disabled="!!client"
          autofocus
          class="mb-3"
        />
        <v-select
          v-model="form.protocol"
          :items="['RADIUS', 'DIAMETER']"
          label="Protocol"
          class="mb-3"
        />
        <template v-if="form.protocol === 'RADIUS'">
          <v-text-field v-model.number="form.port" type="number" label="Port" class="mb-3" />
          <v-text-field
            v-model="form.secret"
            label="Shared secret"
            type="password"
            class="mb-3"
          />
          <v-switch
            v-model="form.passwordRequired"
            color="primary"
            label="Password required"
            density="compact"
            hide-details
          />
        </template>
        <v-switch
          v-model="form.trusted"
          color="primary"
          label="Trusted"
          density="compact"
          hide-details
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="saving" @click="open = false">Cancel</v-btn>
        <v-btn color="primary" :loading="saving" @click="save">
          {{ client ? 'Save' : 'Create' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
