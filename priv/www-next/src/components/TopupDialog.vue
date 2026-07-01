<script setup lang="ts">
import { computed, ref } from 'vue';
import { backendDateToLocalInput, localInputToBackendDate, parseBackendDate } from '@/dateTime';
import { balanceApi } from '@/services';
import { useNotificationsStore } from '@/stores/notifications';
import type { Bucket } from '@/types/tmf';

const open = ref(false);
const saving = ref(false);
const productId = ref('');
const units = ref<'cents' | 'octets' | 'seconds' | 'messages'>('cents');
const amount = ref<number | null>(null);
const mode = ref<'topup' | 'adjustment'>('topup');

// Validity window for the resulting bucket.
//   - validFrom defaults to empty (backend treats this as "valid since now")
//   - validTo is auto-suggested from the longest-living bucket on the same
//     product when the dialog opens; the user can clear it or override.
// Both inputs use the browser's local `datetime-local` format. We convert
// them to the backend's UTC wall-clock format on submit.
const validFrom = ref('');
const validTo = ref('');
const inheritedFromBucket = ref<string>(''); // bucket id we copied the date from
const lookupLoading = ref(false);

const notifications = useNotificationsStore();
const emit = defineEmits<{ done: [] }>();

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** Pick the bucket on this product with the latest endDateTime. */
function latestEndAmong(buckets: Bucket[], pid: string): { iso: string; bucketId: string } | undefined {
  let best: { iso: string; bucketId: string; ts: number } | undefined;
  for (const b of buckets) {
    if (b.product?.id !== pid) continue;
    const end = b.validFor?.endDateTime;
    if (!end) continue;
    const ts = parseBackendDate(end)?.getTime() ?? NaN;
    if (Number.isNaN(ts)) continue;
    // Skip already-expired buckets — defaulting to a date in the past is
    // worse than no default.
    if (ts <= Date.now()) continue;
    if (!best || ts > best.ts) best = { iso: end, bucketId: b.id, ts };
  }
  return best ? { iso: best.iso, bucketId: best.bucketId } : undefined;
}

async function fetchInheritedValidity(pid: string): Promise<void> {
  lookupLoading.value = true;
  try {
    // Same wide-page strategy as BucketsView — Vaadin filter crashes on hyphens.
    const page = await balanceApi.listBuckets(undefined, 0, 499);
    const found = latestEndAmong(page.items, pid);
    if (found) {
      validTo.value = backendDateToLocalInput(found.iso);
      inheritedFromBucket.value = found.bucketId;
    }
  } catch {
    // Silent — the user can still set the date manually. The HTTP
    // interceptor already toasts on real errors.
  } finally {
    lookupLoading.value = false;
  }
}

const validityHint = computed(() => {
  if (lookupLoading.value) return 'Looking up existing bucket validity…';
  if (inheritedFromBucket.value && validTo.value) {
    return `Defaulted from bucket ${inheritedFromBucket.value}. Edit or clear to override.`;
  }
  return 'Optional. Leave blank for an unlimited bucket.';
});

/* ------------------------------------------------------------------ *
 * Lifecycle
 * ------------------------------------------------------------------ */

function show(forProductId?: string) {
  productId.value = forProductId ?? '';
  amount.value = null;
  validFrom.value = '';
  validTo.value = '';
  inheritedFromBucket.value = '';
  open.value = true;
  if (productId.value) void fetchInheritedValidity(productId.value);
}

async function submit() {
  if (!productId.value || !amount.value) {
    notifications.warning('Product ID and amount are required.');
    return;
  }
  const startStr = localInputToBackendDate(validFrom.value);
  const endStr = localInputToBackendDate(validTo.value);
  if (validFrom.value && !startStr) {
    notifications.warning('Invalid "Valid from" date.');
    return;
  }
  if (validTo.value && !endStr) {
    notifications.warning('Invalid "Valid to" date.');
    return;
  }
  if (
    startStr &&
    endStr &&
    (parseBackendDate(endStr)?.getTime() ?? NaN) <= (parseBackendDate(startStr)?.getTime() ?? NaN)
  ) {
    notifications.warning('"Valid to" must be later than "Valid from".');
    return;
  }
  saving.value = true;
  try {
    const payload = { units: units.value, amount: Number(amount.value) };
    const validFor = (startStr || endStr) ? { startDateTime: startStr, endDateTime: endStr } : undefined;
    if (mode.value === 'topup') {
      await balanceApi.topup(productId.value, payload, validFor);
      notifications.success('Top-up applied.');
    } else {
      await balanceApi.adjustment(productId.value, payload, validFor);
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
  <v-dialog v-model="open" max-width="560" persistent>
    <v-card>
      <v-card-title>Balance top-up / adjustment</v-card-title>
      <v-card-text>
        <v-text-field v-model="productId" label="Product ID" autofocus class="mb-3" />
        <v-radio-group v-model="mode" inline class="mb-3" hide-details>
          <v-radio label="Top-up" value="topup" />
          <v-radio label="Adjustment" value="adjustment" />
        </v-radio-group>
        <div class="d-flex ga-3 mb-3">
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

        <v-divider class="mb-3" />
        <div class="text-subtitle-2 mb-1">Validity (optional)</div>
        <div class="text-caption text-medium-emphasis mb-3">
          Limits how long the resulting bucket is honoured. Defaults to the
          longest-living bucket already on this product, when one exists.
        </div>
        <div class="d-flex ga-3">
          <v-text-field
            v-model="validFrom"
            type="datetime-local"
            label="Valid from"
            hint="Leave blank to start immediately."
            persistent-hint
            clearable
          />
          <v-text-field
            v-model="validTo"
            type="datetime-local"
            label="Valid to"
            :hint="validityHint"
            persistent-hint
            clearable
            :loading="lookupLoading"
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
