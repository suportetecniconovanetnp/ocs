<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { subscribersApi } from '@/services';
import { useNotificationsStore } from '@/stores/notifications';
import { parseDuration, formatDuration } from '@/composables/useDuration';
import type { Service, Characteristic } from '@/types/tmf';

interface Props {
  subscriber?: Service | null;
}

const props = withDefaults(defineProps<Props>(), { subscriber: null });
const emit = defineEmits<{ saved: [Service] }>();

const open = ref(false);
const saving = ref(false);
const showAdvanced = ref(false);
const showPassword = ref(false);
const notifications = useNotificationsStore();

interface FormShape {
  serviceIdentity: string;
  servicePassword: string;
  acctSessionInterval: string;
  sessionTimeout: string;
  multisession: boolean;
  productId: string;
  isServiceEnabled: boolean;
  state: Service['state'];
  startDate: string;
  endDate: string;
}

const empty: FormShape = {
  serviceIdentity: '',
  servicePassword: '',
  acctSessionInterval: '',
  sessionTimeout: '',
  multisession: false,
  productId: '',
  isServiceEnabled: true,
  state: 'active',
  startDate: '',
  endDate: '',
};

const form = ref<FormShape>({ ...empty });

function lookup(chars: Characteristic[] | undefined, name: string): unknown {
  return chars?.find((c) => c.name === name)?.value;
}

function loadFromService(svc: Service | null | undefined) {
  if (!svc) {
    form.value = { ...empty };
    return;
  }
  const chars = svc.serviceCharacteristic;
  form.value = {
    serviceIdentity: String(lookup(chars, 'serviceIdentity') ?? svc.id ?? ''),
    servicePassword: String(lookup(chars, 'servicePassword') ?? ''),
    acctSessionInterval: formatDuration(Number(lookup(chars, 'acctSessionInterval'))),
    sessionTimeout: formatDuration(Number(lookup(chars, 'sessionTimeout'))),
    multisession: Boolean(lookup(chars, 'multisession')),
    productId: '',
    isServiceEnabled: svc.isServiceEnabled ?? true,
    state: svc.state ?? 'active',
    startDate: '',
    endDate: '',
  };
}

watch(() => props.subscriber, loadFromService, { immediate: true });

const isEdit = computed(() => Boolean(props.subscriber));

function show() {
  loadFromService(props.subscriber);
  open.value = true;
}

function buildCharacteristics(): Characteristic[] {
  const result: Characteristic[] = [];
  if (form.value.serviceIdentity) {
    result.push({ name: 'serviceIdentity', value: form.value.serviceIdentity });
  }
  if (form.value.servicePassword) {
    result.push({ name: 'servicePassword', value: form.value.servicePassword });
  }
  const interval = parseDuration(form.value.acctSessionInterval);
  if (interval !== undefined) {
    result.push({ name: 'acctSessionInterval', value: interval });
  }
  const timeout = parseDuration(form.value.sessionTimeout);
  if (timeout !== undefined) {
    result.push({ name: 'sessionTimeout', value: timeout });
  }
  if (form.value.multisession) {
    result.push({ name: 'multisession', value: true, valueType: 'boolean' });
  }
  return result;
}

async function save() {
  if (!form.value.serviceIdentity) {
    notifications.warning('Service identity is required.');
    return;
  }
  saving.value = true;
  try {
    const payload: Partial<Service> & { product?: string; startDate?: string; endDate?: string } = {
      serviceCharacteristic: buildCharacteristics(),
      isServiceEnabled: form.value.isServiceEnabled,
      state: form.value.state,
    };
    if (!isEdit.value) {
      payload.id = form.value.serviceIdentity;
    }
    if (form.value.productId) payload.product = form.value.productId;
    if (form.value.startDate) payload.startDate = form.value.startDate;
    if (form.value.endDate) payload.endDate = form.value.endDate;

    const result = isEdit.value
      ? await subscribersApi.update(props.subscriber!.id, payload)
      : await subscribersApi.create(payload);
    notifications.success(isEdit.value ? 'Subscriber updated.' : 'Subscriber created.');
    emit('saved', result);
    open.value = false;
  } finally {
    saving.value = false;
  }
}

defineExpose({ show });
</script>

<template>
  <v-dialog v-model="open" max-width="640" persistent scrollable>
    <v-card>
      <v-card-title>{{ isEdit ? 'Edit subscriber' : 'Add subscriber' }}</v-card-title>
      <v-card-text style="max-height: 70vh">
        <div class="text-overline mb-2">Authentication</div>
        <v-text-field
          v-model="form.serviceIdentity"
          label="Service identity"
          :disabled="isEdit"
          autofocus
          class="mb-3"
        />
        <v-text-field
          v-model="form.servicePassword"
          label="Service password"
          :type="showPassword ? 'text' : 'password'"
          :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
          class="mb-3"
          @click:append-inner="showPassword = !showPassword"
        />

        <v-divider class="mb-3" />
        <div class="text-overline mb-2">Status &amp; product</div>
        <div class="d-flex ga-3 mb-3">
          <v-select
            v-model="form.state"
            :items="['active', 'inactive', 'feasibilityChecked', 'designed', 'reserved', 'terminated']"
            label="State"
          />
          <v-text-field v-model="form.productId" label="Product ID (optional)" />
        </div>
        <v-switch
          v-model="form.isServiceEnabled"
          color="primary"
          label="Service enabled"
          density="compact"
          hide-details
          class="mb-3"
        />

        <v-divider class="mb-3" />
        <div class="d-flex align-center mb-2">
          <div class="text-overline">Authorization</div>
          <v-spacer />
          <v-btn
            size="x-small"
            variant="text"
            :prepend-icon="showAdvanced ? 'mdi-chevron-up' : 'mdi-chevron-down'"
            @click="showAdvanced = !showAdvanced"
          >
            {{ showAdvanced ? 'Hide' : 'Show' }} advanced
          </v-btn>
        </div>
        <v-expand-transition>
          <div v-show="showAdvanced">
            <div class="d-flex ga-3 mb-3">
              <v-text-field
                v-model="form.acctSessionInterval"
                label="Session interval"
                placeholder="e.g. 30m, 2h, 1d"
                hint="Suffix s/m/h/d (default seconds)"
                persistent-hint
              />
              <v-text-field
                v-model="form.sessionTimeout"
                label="Session timeout"
                placeholder="e.g. 1h"
                hint="Suffix s/m/h/d (default seconds)"
                persistent-hint
              />
            </div>
            <v-switch
              v-model="form.multisession"
              color="primary"
              label="Allow multi-session"
              density="compact"
              hide-details
              class="mb-3"
            />
          </div>
        </v-expand-transition>

        <v-divider class="mb-3" />
        <div class="text-overline mb-2">Validity (optional)</div>
        <div class="d-flex ga-3">
          <v-text-field v-model="form.startDate" label="Start date" type="datetime-local" />
          <v-text-field v-model="form.endDate" label="End date" type="datetime-local" />
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="saving" @click="open = false">Cancel</v-btn>
        <v-btn color="primary" :loading="saving" @click="save">
          {{ isEdit ? 'Save' : 'Create' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
