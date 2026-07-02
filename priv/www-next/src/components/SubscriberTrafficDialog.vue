<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
} from 'echarts/components';
import { useTheme } from 'vuetify';
import { logsApi, matchesAnyIdentity, SUBSCRIBER_ID_CHARS } from '@/services';
import { useAsyncResource } from '@/composables/useAsyncResource';
import { useFormatters } from '@/composables/useFormatters';
import { useDateRange, RANGE_OPTIONS } from '@/composables/useDateRange';
import { characteristic, characteristicNumber, type Usage } from '@/types/tmf';

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent]);

const open = ref(false);
const subscriberId = ref<string>('');
const subscriberLookup = ref<{ name: string; value: string } | null>(null);
const showAllRecords = ref(false);
const theme = useTheme();
const { date, bytes, duration, number } = useFormatters();
const { preset, customFrom, customTo, range, bucketing } = useDateRange('24h');

const pageSize = computed(() => {
  const ms = range.value.durationMs;
  if (ms <= 6 * 3_600_000) return 200;
  if (ms <= 24 * 3_600_000) return 500;
  return 1000;
});

const traffic = useAsyncResource(
  () =>
    logsApi.accountingWindow({
      from: range.value.fromIso,
      to: range.value.toIso,
      pageSize: pageSize.value,
      characteristic: subscriberLookup.value ?? undefined,
    }),
  false,
);

watch(
  () => [open.value, subscriberId.value, range.value.fromIso, range.value.toIso, pageSize.value],
  () => {
    if (open.value && subscriberId.value) void traffic.reload();
  },
);

// Items matching the subscriber identity across any of the candidate
// characteristic names (different SigScale deployments use different fields).
const itemsForSubscriber = computed(() => {
  const all = traffic.data.value?.items ?? [];
  if (showAllRecords.value) return all;
  if (subscriberLookup.value && subscriberLookup.value.name === 'imsi') return all;
  return all.filter((u) => matchesAnyIdentity(u, subscriberId.value));
});

const itemsInRange = computed(() => itemsForSubscriber.value);

// Diagnostic — which identifying characteristics ARE present in the fetched
// records, so the user can see whether the dataset has any subscriber field
// to match against (helps when the filter returns nothing).
const availableIdChars = computed(() => {
  const present = new Set<string>();
  for (const u of traffic.data.value?.items ?? []) {
    for (const name of SUBSCRIBER_ID_CHARS) {
      if (u.usageCharacteristic?.some((c) => c.name === name)) present.add(name);
    }
  }
  return Array.from(present);
});

// Distinct identity values present in the fetched data — quick way for the
// user to spot whether their subscriber id matches anything in the dataset.
const distinctIdentities = computed(() => {
  const seen = new Map<string, Set<string>>();
  for (const u of traffic.data.value?.items ?? []) {
    for (const name of SUBSCRIBER_ID_CHARS) {
      const c = u.usageCharacteristic?.find((x) => x.name === name);
      if (c && c.value !== '' && c.value != null) {
        const key = name;
        if (!seen.has(key)) seen.set(key, new Set());
        seen.get(key)!.add(String(c.value));
      }
    }
  }
  return Array.from(seen.entries()).map(([name, values]) => ({
    name,
    values: Array.from(values).slice(0, 8), // cap at 8 to avoid wall of text
    truncated: values.size > 8,
  }));
});

const totalFetched = computed(() => traffic.data.value?.items.length ?? 0);

function show(id: string, characteristic?: { name: string; value: string }) {
  subscriberId.value = id;
  subscriberLookup.value = characteristic ?? null;
  open.value = true;
}

defineExpose({ show });

/* ---------------- Aggregates ---------------- */

// Discard `acctSessionTime` values that look like Event-Timestamps (Unix
// epoch in seconds) instead of elapsed seconds — see SigScale backend quirk
// described in useFormatters.duration().
const TEN_YEARS_SECONDS = 10 * 365 * 86_400;
function sessionSecondsOrZero(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  if (value > TEN_YEARS_SECONDS) return 0;
  return value;
}

const totals = computed(() => {
  let input = 0;
  let output = 0;
  let sessionTime = 0;
  for (const u of itemsInRange.value) {
    input += characteristicNumber(u, 'inputOctets') ?? 0;
    output += characteristicNumber(u, 'outputOctets') ?? 0;
    sessionTime += sessionSecondsOrZero(characteristicNumber(u, 'acctSessionTime'));
  }
  return { input, output, total: input + output, sessionTime, count: itemsInRange.value.length };
});

/* ---------------- Chart ---------------- */

const chartOption = computed(() => {
  const items = itemsInRange.value;
  const { widthMs, format } = bucketing.value;
  const fromMs = range.value.from.getTime();
  const toMs = range.value.to.getTime();

  const slots = new Map<number, { input: number; output: number }>();
  for (let t = Math.floor(fromMs / widthMs) * widthMs; t <= toMs; t += widthMs) {
    slots.set(t, { input: 0, output: 0 });
  }
  for (const u of items) {
    const ts = u.date ? new Date(u.date).getTime() : NaN;
    if (Number.isNaN(ts)) continue;
    const key = Math.floor(ts / widthMs) * widthMs;
    const slot = slots.get(key) ?? { input: 0, output: 0 };
    slot.input += characteristicNumber(u, 'inputOctets') ?? 0;
    slot.output += characteristicNumber(u, 'outputOctets') ?? 0;
    slots.set(key, slot);
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

/* ---------------- Sessions table ---------------- */

interface SessionRow {
  date: string;
  type: string;
  sessionId: string;
  input: string;
  output: string;
  duration: string;
}

const tableHeaders = [
  { title: 'Date', key: 'date' },
  { title: 'Type', key: 'type' },
  { title: 'Session', key: 'sessionId' },
  { title: 'Input', key: 'input', align: 'end' as const },
  { title: 'Output', key: 'output', align: 'end' as const },
  { title: 'Duration', key: 'duration', align: 'end' as const },
];

function row(u: Usage): SessionRow {
  return {
    date: date(u.date),
    type: characteristic(u, 'type') ?? u.status ?? '—',
    sessionId: characteristic(u, 'acctSessionId') ?? '—',
    input: bytes(characteristicNumber(u, 'inputOctets')),
    output: bytes(characteristicNumber(u, 'outputOctets')),
    duration: duration(characteristicNumber(u, 'acctSessionTime')),
  };
}

const sessionRows = computed(() => itemsInRange.value.map(row));
</script>

<template>
  <v-dialog v-model="open" max-width="1100" scrollable>
    <v-card>
      <v-card-title class="d-flex align-center flex-wrap ga-2">
        <v-icon icon="mdi-chart-timeline-variant" color="primary" class="mr-1" />
        Traffic history
        <v-chip size="small" variant="tonal">{{ subscriberId }}</v-chip>
        <v-chip
          v-if="subscriberLookup"
          size="x-small"
          variant="text"
          class="text-medium-emphasis"
        >
          {{ subscriberLookup.name }}
        </v-chip>
        <v-chip
          v-if="!traffic.loading.value && totalFetched > 0"
          size="x-small"
          variant="text"
          class="text-medium-emphasis"
        >
          {{ itemsInRange.length }}/{{ totalFetched }} records
        </v-chip>
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
      </v-card-title>

      <v-expand-transition>
        <div v-show="preset === 'custom'" class="d-flex ga-3 px-4 pb-3">
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

      <v-card-text style="max-height: 80vh">
        <v-alert
          v-if="showAllRecords"
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-3"
          closable
          @click:close="showAllRecords = false"
        >
          Showing <strong>all</strong> records (subscriber filter disabled).
          <v-btn size="x-small" variant="text" class="ml-2" @click="showAllRecords = false">
            Re-enable filter
          </v-btn>
        </v-alert>

        <!-- Summary stats -->
        <v-row dense class="mb-3">
          <v-col cols="6" md="3">
            <v-card variant="tonal" color="primary">
              <v-card-text>
                <div class="text-caption">Input</div>
                <div class="text-h6 font-weight-bold">{{ bytes(totals.input) }}</div>
              </v-card-text>
            </v-card>
          </v-col>
          <v-col cols="6" md="3">
            <v-card variant="tonal" color="info">
              <v-card-text>
                <div class="text-caption">Output</div>
                <div class="text-h6 font-weight-bold">{{ bytes(totals.output) }}</div>
              </v-card-text>
            </v-card>
          </v-col>
          <v-col cols="6" md="3">
            <v-card variant="tonal" color="warning">
              <v-card-text>
                <div class="text-caption">Total session time</div>
                <div class="text-h6 font-weight-bold">{{ duration(totals.sessionTime) }}</div>
              </v-card-text>
            </v-card>
          </v-col>
          <v-col cols="6" md="3">
            <v-card variant="tonal" color="success">
              <v-card-text>
                <div class="text-caption">Records</div>
                <div class="text-h6 font-weight-bold">{{ number(totals.count) }}</div>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>

        <!-- Chart -->
        <v-card class="mb-3">
          <v-card-text>
            <div v-if="traffic.loading.value" class="text-center pa-6">
              <v-progress-circular indeterminate color="primary" />
            </div>
            <div
              v-else-if="!itemsInRange.length"
              class="text-center pa-6"
            >
              <p class="text-medium-emphasis mb-3">
                No accounting records matching this subscriber in the selected range.
              </p>
              <p class="text-caption text-medium-emphasis mb-3">
                Fetched <strong>{{ totalFetched }}</strong> record{{ totalFetched === 1 ? '' : 's' }};
                <strong>{{ itemsForSubscriber.length }}</strong> matched
                <code>{{ subscriberId }}</code>;
                <strong>{{ itemsInRange.length }}</strong> within the time range.
              </p>

              <v-card
                v-if="distinctIdentities.length"
                variant="tonal"
                class="text-left mx-auto mb-3"
                max-width="600"
              >
                <v-card-text>
                  <div class="text-caption text-medium-emphasis mb-2">
                    Identities found in the dataset (sample):
                  </div>
                  <div v-for="d in distinctIdentities" :key="d.name" class="mb-1">
                    <span class="text-caption font-weight-medium mr-2">{{ d.name }}:</span>
                    <code v-for="(v, i) in d.values" :key="v" class="mr-1 text-caption">
                      {{ v }}{{ i < d.values.length - 1 ? ',' : '' }}
                    </code>
                    <span v-if="d.truncated" class="text-caption text-medium-emphasis">…</span>
                  </div>
                </v-card-text>
              </v-card>

              <v-btn
                v-if="totalFetched > 0"
                size="small"
                variant="tonal"
                color="primary"
                @click="showAllRecords = true"
              >
                Show all {{ totalFetched }} records (no subscriber filter)
              </v-btn>
            </div>
            <v-chart v-else :option="chartOption" autoresize style="height: 300px" />
          </v-card-text>
        </v-card>

        <!-- Sessions table -->
        <v-data-table
          :items="sessionRows"
          :headers="tableHeaders"
          :loading="traffic.loading.value"
          density="compact"
          items-per-page="25"
        />
      </v-card-text>

      <v-divider />
      <v-card-actions>
        <v-spacer />
        <v-btn @click="open = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
