<script setup lang="ts">
import { ref } from 'vue';
import { balanceApi } from '@/services';
import { useNotificationsStore } from '@/stores/notifications';

const open = ref(false);
const saving = ref(false);
const productId = ref('');
const units = ref<'cents' | 'octets' | 'seconds' | 'messages'>('cents');
const amount = ref<number | null>(null);
const mode = ref<'topup' | 'adjustment'>('topup');
const notifications = useNotificationsStore();

const emit = defineEmits<{ done: [] }>();

function show(forProductId?: string) {
  productId.value = forProductId ?? '';
  amount.value = null;
  open.value = true;
}

async function submit() {
  if (!productId.value || !amount.value) {
    notifications.warning('Product ID and amount are required.');
    return;
  }
  saving.value = true;
  try {
    const payload = { units: units.value, amount: Number(amount.value) };
    if (mode.value === 'topup') {
      await balanceApi.topup(productId.value, payload);
      notifications.success('Top-up applied.');
    } else {
      await balanceApi.adjustment(productId.value, payload);
      notifications.success('Adjustment applied.');
    }
    emit('done');
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
      <v-card-title>Balance top-up / adjustment</v-card-title>
      <v-card-text>
        <v-text-field v-model="productId" label="Product ID" autofocus class="mb-3" />
        <v-radio-group v-model="mode" inline class="mb-3" hide-details>
          <v-radio label="Top-up" value="topup" />
          <v-radio label="Adjustment" value="adjustment" />
        </v-radio-group>
        <div class="d-flex ga-3">
          <v-text-field v-model.number="amount" type="number" label="Amount" />
          <v-select
            v-model="units"
            :items="[
              { title: 'Cents', value: 'cents' },
              { title: 'Octets (bytes)', value: 'octets' },
              { title: 'Seconds', value: 'seconds' },
              { title: 'Messages', value: 'messages' },
            ]"
            label="Units"
            style="max-width: 180px"
          />
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="saving" @click="open = false">Cancel</v-btn>
        <v-btn color="primary" :loading="saving" @click="submit">Apply</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
