<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { catalogApi } from '@/services';
import { useAsyncResource } from '@/composables/useAsyncResource';
import { useFormatters } from '@/composables/useFormatters';
import OfferingFormDialog from '@/components/OfferingFormDialog.vue';

const route = useRoute();
const router = useRouter();
const { date, money } = useFormatters();

const offeringId = computed(() => route.params.id as string);
const offering = useAsyncResource(() => catalogApi.getOffering(offeringId.value));
const formDialog = ref<InstanceType<typeof OfferingFormDialog> | null>(null);

function back() {
  router.push({ name: 'catalog' });
}

function edit() {
  formDialog.value?.show();
}

function periodLabel(period?: string, monthDay?: number) {
  if (!period) return '—';
  if (period === 'monthly' && typeof monthDay === 'number') return `${period} (day ${monthDay})`;
  return period;
}
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4 ga-2">
      <v-btn icon="mdi-arrow-left" variant="text" @click="back" />
      <h1 class="text-h5 font-weight-medium">
        {{ offering.data.value?.name ?? 'Offering' }}
      </h1>
      <v-chip
        v-if="offering.data.value?.lifecycleStatus"
        size="small"
        :color="offering.data.value.lifecycleStatus === 'Active' ? 'success' : 'default'"
        class="ml-2"
      >
        {{ offering.data.value.lifecycleStatus }}
      </v-chip>
      <v-spacer />
      <v-btn
        v-if="offering.data.value"
        color="primary"
        prepend-icon="mdi-pencil"
        @click="edit"
      >
        Edit
      </v-btn>
    </div>

    <div v-if="offering.loading.value" class="d-flex justify-center pa-8">
      <v-progress-circular indeterminate color="primary" />
    </div>
    <template v-else-if="offering.data.value">
      <v-card class="mb-4">
        <v-card-title>General</v-card-title>
        <v-card-text>
          <v-table density="compact">
            <tbody>
              <tr><th class="text-left" style="width: 220px">ID</th><td><code>{{ offering.data.value.id }}</code></td></tr>
              <tr><th class="text-left">Name</th><td>{{ offering.data.value.name }}</td></tr>
              <tr><th class="text-left">Description</th><td>{{ offering.data.value.description ?? '—' }}</td></tr>
              <tr><th class="text-left">Bundle</th><td>{{ offering.data.value.isBundle ? 'Yes' : 'No' }}</td></tr>
              <tr v-if="offering.data.value.validFor">
                <th class="text-left">Valid from</th>
                <td>{{ date(offering.data.value.validFor.startDateTime) }}</td>
              </tr>
              <tr v-if="offering.data.value.validFor">
                <th class="text-left">Valid to</th>
                <td>{{ date(offering.data.value.validFor.endDateTime) }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>

      <v-card v-if="offering.data.value.productOfferingPrice?.length" class="mb-4">
        <v-card-title>Prices</v-card-title>
        <v-card-text class="pa-0">
          <v-table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Period</th>
                <th>Unit</th>
                <th class="text-end">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(p, i) in offering.data.value.productOfferingPrice" :key="p.id ?? i">
                <td>{{ p.name }}</td>
                <td>
                  <v-chip size="x-small">{{ p.priceType ?? '—' }}</v-chip>
                </td>
                <td>{{ periodLabel(p.recurringChargePeriod, p.recurringChargeDayOfMonth) }}</td>
                <td>{{ p.unitOfMeasure ?? '—' }}</td>
                <td class="text-end">
                  <code v-if="p.price?.taxIncludedAmount != null">
                    {{ money(p.price.taxIncludedAmount, p.price.currencyCode) }}
                  </code>
                  <span v-else>—</span>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>

      <v-card v-if="offering.data.value.bundledProductOffering?.length" class="mb-4">
        <v-card-title>Bundled offerings</v-card-title>
        <v-card-text class="pa-0">
          <v-list density="compact">
            <v-list-item
              v-for="b in offering.data.value.bundledProductOffering"
              :key="b.id"
              :title="b.name ?? b.id"
              :subtitle="b.id"
              @click="router.push({ name: 'offering-detail', params: { id: b.id } })"
            />
          </v-list>
        </v-card-text>
      </v-card>

      <v-card>
        <v-card-title>Raw payload</v-card-title>
        <v-card-text>
          <pre class="text-caption" style="overflow-x: auto">{{ JSON.stringify(offering.data.value, null, 2) }}</pre>
        </v-card-text>
      </v-card>

      <OfferingFormDialog ref="formDialog" :offering="offering.data.value" @saved="offering.reload" />
    </template>
  </div>
</template>
