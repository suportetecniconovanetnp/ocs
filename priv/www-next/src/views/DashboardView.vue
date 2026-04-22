<script setup lang="ts">
import { computed } from 'vue';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart, BarChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
} from 'echarts/components';
import { useTheme } from 'vuetify';
import { useI18n } from 'vue-i18n';
import { subscribersApi, clientsApi, balanceApi, logsApi } from '@/services';
import { useAsyncResource } from '@/composables/useAsyncResource';
import { characteristicNumber } from '@/types/tmf';

use([
  CanvasRenderer,
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
]);

const theme = useTheme();
const { t } = useI18n();

const subscribers = useAsyncResource(() => subscribersApi.list(0, 0));
const clients = useAsyncResource(() => clientsApi.list(0, 0));
const buckets = useAsyncResource(() => balanceApi.listBuckets(undefined, 0, 0));
const accounting = useAsyncResource(() => logsApi.accounting(0, 49));

function safeT(key: string, fallback: string): string {
  const out = t(key);
  return out === key ? fallback : out;
}

const stats = computed(() => [
  {
    titleKey: 'subs',
    fallback: 'Subscribers',
    icon: 'mdi-account-group',
    value: subscribers.data.value?.contentRange?.total ?? subscribers.data.value?.total,
    color: 'primary',
    loading: subscribers.loading.value,
  },
  {
    titleKey: 'clients',
    fallback: 'Clients',
    icon: 'mdi-server-network',
    value: clients.data.value?.contentRange?.total ?? clients.data.value?.total,
    color: 'info',
    loading: clients.loading.value,
  },
  {
    titleKey: 'buckets',
    fallback: 'Buckets',
    icon: 'mdi-wallet',
    value: buckets.data.value?.contentRange?.total ?? buckets.data.value?.total,
    color: 'success',
    loading: buckets.loading.value,
  },
  {
    titleKey: 'sessions',
    fallback: 'Recent sessions',
    icon: 'mdi-radio-tower',
    value: accounting.data.value?.items.length,
    color: 'warning',
    loading: accounting.loading.value,
  },
]);

const trafficChart = computed(() => {
  const items = accounting.data.value?.items ?? [];
  const slots = new Map<string, { input: number; output: number }>();
  for (const usage of items) {
    const ts = new Date(usage.date);
    if (Number.isNaN(ts.getTime())) continue;
    const key = `${ts.getHours().toString().padStart(2, '0')}:00`;
    const slot = slots.get(key) ?? { input: 0, output: 0 };
    slot.input += characteristicNumber(usage, 'acctInputOctets') ?? 0;
    slot.output += characteristicNumber(usage, 'acctOutputOctets') ?? 0;
    slots.set(key, slot);
  }
  const xAxis = Array.from(slots.keys()).sort();
  const inputSeries = xAxis.map((k) => slots.get(k)!.input);
  const outputSeries = xAxis.map((k) => slots.get(k)!.output);

  return {
    backgroundColor: 'transparent',
    textStyle: { color: theme.current.value.colors['on-surface'] },
    tooltip: { trigger: 'axis' },
    legend: { data: ['Input bytes', 'Output bytes'] },
    grid: { left: 50, right: 20, top: 40, bottom: 30 },
    xAxis: { type: 'category', data: xAxis },
    yAxis: { type: 'value' },
    series: [
      {
        name: 'Input bytes',
        type: 'line',
        smooth: true,
        areaStyle: { opacity: 0.1 },
        data: inputSeries,
        itemStyle: { color: theme.current.value.colors.primary },
      },
      {
        name: 'Output bytes',
        type: 'line',
        smooth: true,
        areaStyle: { opacity: 0.1 },
        data: outputSeries,
        itemStyle: { color: theme.current.value.colors.info },
      },
    ],
  };
});

function reloadAll() {
  void subscribers.reload();
  void clients.reload();
  void buckets.reload();
  void accounting.reload();
}
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <h1 class="text-h5 font-weight-medium">{{ safeT('dashboard', 'Dashboard') }}</h1>
      <v-spacer />
      <v-btn prepend-icon="mdi-refresh" variant="tonal" @click="reloadAll">
        {{ safeT('refresh', 'Refresh') }}
      </v-btn>
    </div>

    <v-row dense>
      <v-col v-for="stat in stats" :key="stat.titleKey" cols="12" sm="6" md="3">
        <v-card :loading="stat.loading">
          <v-card-text class="d-flex align-center">
            <v-avatar :color="stat.color" size="48" class="mr-4">
              <v-icon :icon="stat.icon" size="28" color="white" />
            </v-avatar>
            <div>
              <div class="text-caption text-medium-emphasis">
                {{ safeT(stat.titleKey, stat.fallback) }}
              </div>
              <div class="text-h5 font-weight-bold">
                {{ stat.value ?? '—' }}
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-card class="mt-4">
      <v-card-title>{{ safeT('traffic', 'Accounting traffic — last 50 records') }}</v-card-title>
      <v-card-text>
        <div v-if="accounting.loading.value" class="text-center pa-8">
          <v-progress-circular indeterminate color="primary" />
        </div>
        <div v-else-if="!accounting.data.value?.items?.length" class="text-center pa-8 text-medium-emphasis">
          No accounting data available.
        </div>
        <v-chart v-else :option="trafficChart" autoresize style="height: 360px" />
      </v-card-text>
    </v-card>
  </div>
</template>
