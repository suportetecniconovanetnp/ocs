<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart, BarChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
} from 'echarts/components';
import { useTheme } from 'vuetify';
import { useI18n } from 'vue-i18n';
import {
  subscribersApi,
  clientsApi,
  balanceApi,
  logsApi,
  healthApi,
  diameterAppTotals,
  ccaResults,
  deaResults,
  uptime,
  schedulerUtilization,
  tableSize,
  DIAMETER_APPS,
} from '@/services';
import { useAsyncResource } from '@/composables/useAsyncResource';
import { characteristicNumber } from '@/types/tmf';
import { useFormatters } from '@/composables/useFormatters';
import { useDateRange, RANGE_OPTIONS } from '@/composables/useDateRange';

use([
  CanvasRenderer,
  LineChart,
  BarChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
]);

const theme = useTheme();
const { t } = useI18n();
const { number, bytes, duration } = useFormatters();

// Time-range filter for accounting metrics. Health/Diameter counters are
// point-in-time totals so they ignore the range; the chart and "Recent
// traffic" stat re-fetch whenever the user changes it.
const { preset, customFrom, customTo, range, bucketing } = useDateRange('24h');

const subscribers = useAsyncResource(() => subscribersApi.list(0, 0));
const clients = useAsyncResource(() => clientsApi.list(0, 0));
const buckets = useAsyncResource(() => balanceApi.listBuckets(undefined, 0, 0));
// Pull a larger window when the range is wide; backend caps via Range header.
const accountingPageSize = computed(() => {
  const ms = range.value.durationMs;
  if (ms <= 6 * 3_600_000) return 200;
  if (ms <= 24 * 3_600_000) return 500;
  return 1000;
});
// SigScale's usage endpoint doesn't support arbitrary date-range filters
// server-side. We therefore page backwards from the newest records until the
// requested window is covered, then chart only those in-range items.
const accounting = useAsyncResource(() =>
  logsApi.accountingWindow({
    from: range.value.fromIso,
    to: range.value.toIso,
    pageSize: accountingPageSize.value,
  }),
);
const health = useAsyncResource(() => healthApi.get());

watch(
  () => [range.value.fromIso, range.value.toIso, accountingPageSize.value],
  () => void accounting.reload(),
);

const accountingInRange = computed(() => accounting.data.value?.items ?? []);

// Auto-refresh health using its own Cache-Control max-age (legacy behaviour).
let healthTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleHealthRefresh() {
  if (healthTimer) clearTimeout(healthTimer);
  const seconds = health.data.value?.maxAge ?? 60;
  healthTimer = setTimeout(async () => {
    await health.reload();
    scheduleHealthRefresh();
  }, Math.max(1, seconds) * 1000);
}
onMounted(() => scheduleHealthRefresh());
onBeforeUnmount(() => {
  if (healthTimer) clearTimeout(healthTimer);
});

function safeT(key: string, fallback: string): string {
  const out = t(key);
  return out === key ? fallback : out;
}

function fmtCount(v: number | undefined): string {
  return v == null ? '—' : number(v);
}

const checks = computed(() => health.data.value?.data.checks ?? {});

/* ---------------- Stat cards ---------------- */

const recentTraffic = computed(() => {
  let total = 0;
  for (const u of accountingInRange.value) {
    total += characteristicNumber(u, 'inputOctets') ?? 0;
    total += characteristicNumber(u, 'outputOctets') ?? 0;
  }
  return total;
});

const subscriberTotal = computed(
  () =>
    tableSize(checks.value, 'service') ??
    subscribers.data.value?.contentRange?.total ??
    subscribers.data.value?.total,
);
const bucketTotal = computed(
  () =>
    tableSize(checks.value, 'bucket') ??
    buckets.data.value?.contentRange?.total ??
    buckets.data.value?.total,
);
const productTotal = computed(() => tableSize(checks.value, 'product'));
const uptimeSeconds = computed(() => uptime(checks.value));

const stats = computed(() => [
  {
    titleKey: 'subs',
    fallback: 'Subscribers',
    icon: 'mdi-account-group',
    value: fmtCount(subscriberTotal.value),
    color: 'primary',
    loading: subscribers.loading.value,
  },
  {
    titleKey: 'clients',
    fallback: 'Clients',
    icon: 'mdi-server-network',
    value: fmtCount(clients.data.value?.contentRange?.total ?? clients.data.value?.total),
    color: 'info',
    loading: clients.loading.value,
  },
  {
    titleKey: 'buckets',
    fallback: 'Buckets',
    icon: 'mdi-wallet',
    value: fmtCount(bucketTotal.value),
    color: 'success',
    loading: buckets.loading.value,
  },
  {
    titleKey: 'products',
    fallback: 'Products',
    icon: 'mdi-package-variant',
    value: fmtCount(productTotal.value),
    color: 'secondary',
    loading: health.loading.value,
  },
  {
    titleKey: 'uptime',
    fallback: 'Uptime',
    icon: 'mdi-timer-outline',
    value: uptimeSeconds.value != null ? duration(uptimeSeconds.value) : '—',
    color: 'accent',
    loading: health.loading.value,
  },
  {
    titleKey: 'recentTraffic',
    fallback: 'Recent traffic',
    icon: 'mdi-swap-vertical',
    value: accounting.data.value ? bytes(recentTraffic.value) : '—',
    color: 'warning',
    loading: accounting.loading.value,
  },
]);

/* ---------------- Diameter Applications ---------------- */

const diameterTotals = computed(() => diameterAppTotals(checks.value));
const diameterChart = computed(() => {
  const totals = diameterTotals.value;
  return {
    backgroundColor: 'transparent',
    textStyle: { color: theme.current.value.colors['on-surface'] },
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => number(v) },
    grid: { left: 60, right: 20, top: 20, bottom: 30 },
    xAxis: { type: 'category', data: DIAMETER_APPS.map((a) => a.toUpperCase()) },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => number(v) } },
    series: [
      {
        type: 'bar',
        data: DIAMETER_APPS.map((a) => totals[a]),
        itemStyle: { color: theme.current.value.colors.primary },
        label: { show: true, position: 'top', formatter: (p: { value: number }) => number(p.value) },
      },
    ],
  };
});
const hasDiameter = computed(() =>
  Object.values(diameterTotals.value).some((v) => v > 0),
);

/* ---------------- Credit Control (CCA) ---------------- */

const cca = computed(() => ccaResults(checks.value));
const ccaChart = computed(() => {
  const c = cca.value;
  const slices = [
    { name: 'Success (2001)', value: c.success, color: theme.current.value.colors.success },
    { name: 'Credit limit (4012)', value: c.creditLimitReached, color: '#ed6c02' },
    { name: 'No services (5030)', value: c.noServices, color: '#9e9e9e' },
    { name: 'End-user denied (4010)', value: c.endUserDenied, color: '#c62828' },
    { name: 'Rating failed (5031)', value: c.ratingFailed, color: '#7b1fa2' },
    { name: 'Unknown user (5012)', value: c.unknownEndUser, color: '#0277bd' },
  ].filter((s) => s.value > 0);
  return {
    backgroundColor: 'transparent',
    textStyle: { color: theme.current.value.colors['on-surface'] },
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, type: 'scroll' },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: true,
        label: { show: false },
        data: slices.map((s) => ({ name: s.name, value: s.value, itemStyle: { color: s.color } })),
      },
    ],
  };
});
const ccaTotal = computed(() =>
  Object.values(cca.value).reduce((a, b) => a + b, 0),
);

/* ---------------- AAA (DEA) ---------------- */

const dea = computed(() => deaResults(checks.value));
const deaTotal = computed(() => Object.values(dea.value).reduce((a, b) => a + b, 0));

/* ---------------- Scheduler utilization ---------------- */

const schedulers = computed(() => schedulerUtilization(checks.value));

/* ---------------- Accounting traffic over time ---------------- */

const trafficChart = computed(() => {
  const items = accountingInRange.value;
  const { widthMs, format } = bucketing.value;
  const fromMs = range.value.from.getTime();
  const toMs = range.value.to.getTime();

  // Pre-seed empty slots so gaps (no traffic) render as zero, not collapse.
  const slots = new Map<number, { input: number; output: number }>();
  for (let t = Math.floor(fromMs / widthMs) * widthMs; t <= toMs; t += widthMs) {
    slots.set(t, { input: 0, output: 0 });
  }

  for (const usage of items) {
    const ts = usage.date ? new Date(usage.date).getTime() : NaN;
    if (Number.isNaN(ts)) continue;
    const slotKey = Math.floor(ts / widthMs) * widthMs;
    const slot = slots.get(slotKey) ?? { input: 0, output: 0 };
    slot.input += characteristicNumber(usage, 'inputOctets') ?? 0;
    slot.output += characteristicNumber(usage, 'outputOctets') ?? 0;
    slots.set(slotKey, slot);
  }

  const sortedKeys = Array.from(slots.keys()).sort((a, b) => a - b);
  const xAxis = sortedKeys.map((k) => format(new Date(k)));
  const inputSeries = sortedKeys.map((k) => slots.get(k)!.input);
  const outputSeries = sortedKeys.map((k) => slots.get(k)!.output);

  return {
    backgroundColor: 'transparent',
    textStyle: { color: theme.current.value.colors['on-surface'] },
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => bytes(v) },
    legend: { data: ['Input', 'Output'] },
    grid: { left: 70, right: 20, top: 40, bottom: 30 },
    xAxis: {
      type: 'category',
      data: xAxis,
      axisLabel: { rotate: xAxis.length > 24 ? 45 : 0 },
    },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => bytes(v, 0) } },
    series: [
      {
        name: 'Input',
        type: 'line',
        smooth: true,
        areaStyle: { opacity: 0.1 },
        data: inputSeries,
        itemStyle: { color: theme.current.value.colors.primary },
      },
      {
        name: 'Output',
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
  void health.reload();
}
</script>

<template>
  <div>
    <div class="d-flex align-center flex-wrap ga-3 mb-4">
      <h1 class="text-h5 font-weight-medium">{{ safeT('dashboard', 'Dashboard') }}</h1>
      <v-spacer />
      <v-btn-toggle
        v-model="preset"
        density="comfortable"
        color="primary"
        mandatory
        divided
      >
        <v-btn
          v-for="opt in RANGE_OPTIONS"
          :key="opt.value"
          :value="opt.value"
          size="small"
        >
          {{ opt.label }}
        </v-btn>
      </v-btn-toggle>
      <v-btn prepend-icon="mdi-refresh" variant="tonal" @click="reloadAll">
        {{ safeT('refresh', 'Refresh') }}
      </v-btn>
    </div>

    <v-expand-transition>
      <div v-show="preset === 'custom'" class="d-flex ga-3 mb-3">
        <v-text-field
          v-model="customFrom"
          label="From"
          type="datetime-local"
          density="compact"
          hide-details
        />
        <v-text-field
          v-model="customTo"
          label="To"
          type="datetime-local"
          density="compact"
          hide-details
        />
      </div>
    </v-expand-transition>

    <!-- Stat strip -->
    <v-row dense>
      <v-col v-for="stat in stats" :key="stat.titleKey" cols="12" sm="6" md="4" lg="2">
        <v-card :loading="stat.loading">
          <v-card-text class="d-flex align-center">
            <v-avatar :color="stat.color" size="40" class="mr-3">
              <v-icon :icon="stat.icon" size="24" color="white" />
            </v-avatar>
            <div class="overflow-hidden">
              <div class="text-caption text-medium-emphasis text-truncate">
                {{ safeT(stat.titleKey, stat.fallback) }}
              </div>
              <div class="text-h6 font-weight-bold text-truncate">{{ stat.value }}</div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Diameter Applications + CCA -->
    <v-row class="mt-2" dense>
      <v-col cols="12" md="6">
        <v-card :loading="health.loading.value">
          <v-card-title class="d-flex align-center">
            Diameter Applications
            <v-spacer />
            <v-tooltip text="Total messages per Diameter application (Base/Gx/Ro/STa/SWm)">
              <template #activator="{ props }">
                <v-icon v-bind="props" icon="mdi-information-outline" size="small" color="grey" />
              </template>
            </v-tooltip>
          </v-card-title>
          <v-card-text>
            <div v-if="!hasDiameter" class="text-center pa-4 text-medium-emphasis">
              No Diameter counters reported by /health
            </div>
            <v-chart v-else :option="diameterChart" autoresize style="height: 280px" />
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="6">
        <v-card :loading="health.loading.value">
          <v-card-title class="d-flex align-center">
            Credit Control Requests
            <v-chip class="ml-2" size="small">{{ number(ccaTotal) }} CCA</v-chip>
          </v-card-title>
          <v-card-text>
            <div v-if="ccaTotal === 0" class="text-center pa-4 text-medium-emphasis">
              No Credit-Control answers recorded yet
            </div>
            <v-chart v-else :option="ccaChart" autoresize style="height: 280px" />
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- AAA + Scheduler -->
    <v-row class="mt-2" dense>
      <v-col cols="12" md="6">
        <v-card :loading="health.loading.value">
          <v-card-title class="d-flex align-center">
            AAA Requests (Diameter STa)
            <v-chip class="ml-2" size="small">{{ number(deaTotal) }} DEA</v-chip>
          </v-card-title>
          <v-card-text>
            <v-table v-if="deaTotal > 0" density="compact">
              <tbody>
                <tr>
                  <td>Success (2001)</td>
                  <td class="text-end">
                    <v-chip color="success" size="small">{{ number(dea.success) }}</v-chip>
                  </td>
                </tr>
                <tr>
                  <td>Multi-round auth (1001)</td>
                  <td class="text-end">
                    <v-chip color="info" size="small">{{ number(dea.multiRound) }}</v-chip>
                  </td>
                </tr>
                <tr>
                  <td>Auth rejected (5001)</td>
                  <td class="text-end">
                    <v-chip color="error" size="small">{{ number(dea.authRejected) }}</v-chip>
                  </td>
                </tr>
                <tr>
                  <td>Unknown user (5012)</td>
                  <td class="text-end">
                    <v-chip color="warning" size="small">{{ number(dea.unknownEndUser) }}</v-chip>
                  </td>
                </tr>
              </tbody>
            </v-table>
            <div v-else class="text-center pa-4 text-medium-emphasis">
              No AAA answers recorded yet
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="6">
        <v-card :loading="health.loading.value">
          <v-card-title>
            Scheduler utilization
            <v-chip v-if="schedulers.length" class="ml-2" size="small">
              {{ schedulers.length }} cores
            </v-chip>
          </v-card-title>
          <v-card-text>
            <div v-if="!schedulers.length" class="text-center pa-4 text-medium-emphasis">
              No scheduler data
            </div>
            <div v-else class="d-flex flex-wrap ga-2">
              <div
                v-for="s in schedulers"
                :key="s.componentId"
                class="text-center"
                style="min-width: 70px"
              >
                <v-progress-circular
                  :model-value="Math.min(100, s.utilization * 100)"
                  :color="s.utilization > 0.7 ? 'error' : s.utilization > 0.4 ? 'warning' : 'success'"
                  size="48"
                  width="6"
                >
                  <span class="text-caption">{{ Math.round(s.utilization * 100) }}%</span>
                </v-progress-circular>
                <div class="text-caption text-medium-emphasis mt-1">{{ s.componentId }}</div>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Accounting traffic chart -->
    <v-card class="mt-4">
      <v-card-title class="d-flex align-center">
        Accounting traffic
        <v-chip class="ml-2" size="small" variant="tonal">
          {{ RANGE_OPTIONS.find((o) => o.value === preset)?.label ?? preset }}
        </v-chip>
        <v-spacer />
        <span class="text-caption text-medium-emphasis">
          {{ accountingInRange.length }} records in range
          ({{ accounting.data.value?.items.length ?? 0 }} fetched)
        </span>
      </v-card-title>
      <v-card-text>
        <div v-if="accounting.loading.value" class="text-center pa-8">
          <v-progress-circular indeterminate color="primary" />
        </div>
        <div
          v-else-if="!accounting.data.value?.items?.length"
          class="text-center pa-8 text-medium-emphasis"
        >
          No accounting data available.
        </div>
        <v-chart v-else :option="trafficChart" autoresize style="height: 360px" />
      </v-card-text>
    </v-card>
  </div>
</template>
