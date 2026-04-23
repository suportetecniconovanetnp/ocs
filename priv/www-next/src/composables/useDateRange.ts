import { computed, ref } from 'vue';

export type RangePreset = '1h' | '6h' | '24h' | '7d' | '30d' | 'custom';

export interface RangeOption {
  value: RangePreset;
  label: string;
  durationMs: number; // 0 for custom
}

export const RANGE_OPTIONS: RangeOption[] = [
  { value: '1h', label: 'Last hour', durationMs: 60 * 60 * 1000 },
  { value: '6h', label: 'Last 6h', durationMs: 6 * 60 * 60 * 1000 },
  { value: '24h', label: 'Last 24h', durationMs: 24 * 60 * 60 * 1000 },
  { value: '7d', label: 'Last 7d', durationMs: 7 * 24 * 60 * 60 * 1000 },
  { value: '30d', label: 'Last 30d', durationMs: 30 * 24 * 60 * 60 * 1000 },
  { value: 'custom', label: 'Custom', durationMs: 0 },
];

export interface ResolvedRange {
  from: Date;
  to: Date;
  fromIso: string;
  toIso: string;
  durationMs: number;
}

/**
 * Reactive date range with built-in presets. For preset values the range is
 * recomputed on each access (so "Last hour" always means "from now-1h").
 * Custom mode falls back to the explicit `customFrom`/`customTo` refs.
 */
export function useDateRange(initial: RangePreset = '24h') {
  const preset = ref<RangePreset>(initial);
  const customFrom = ref<string>('');
  const customTo = ref<string>('');

  const range = computed<ResolvedRange>(() => {
    const now = Date.now();
    if (preset.value === 'custom') {
      const from = customFrom.value ? new Date(customFrom.value) : new Date(now - 86_400_000);
      const to = customTo.value ? new Date(customTo.value) : new Date(now);
      return {
        from,
        to,
        fromIso: from.toISOString(),
        toIso: to.toISOString(),
        durationMs: to.getTime() - from.getTime(),
      };
    }
    const opt = RANGE_OPTIONS.find((o) => o.value === preset.value)!;
    const to = new Date(now);
    const from = new Date(now - opt.durationMs);
    return {
      from,
      to,
      fromIso: from.toISOString(),
      toIso: to.toISOString(),
      durationMs: opt.durationMs,
    };
  });

  /**
   * Pick a sensible bucket size for time-series binning based on the range.
   * Returns the bucket width in milliseconds and a formatter for axis labels.
   */
  const bucketing = computed(() => {
    const ms = range.value.durationMs;
    if (ms <= 6 * 3_600_000) {
      // ≤6h → 5-minute buckets, label HH:MM
      return {
        widthMs: 5 * 60 * 1000,
        format: (d: Date) =>
          `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      };
    }
    if (ms <= 24 * 3_600_000) {
      // ≤24h → 1-hour buckets, label HH:00
      return {
        widthMs: 60 * 60 * 1000,
        format: (d: Date) => `${String(d.getHours()).padStart(2, '0')}:00`,
      };
    }
    if (ms <= 7 * 86_400_000) {
      // ≤7d → 6-hour buckets, label MM-DD HH:00
      return {
        widthMs: 6 * 60 * 60 * 1000,
        format: (d: Date) =>
          `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}h`,
      };
    }
    // longer → 1-day buckets, label MM-DD
    return {
      widthMs: 86_400_000,
      format: (d: Date) =>
        `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    };
  });

  return { preset, customFrom, customTo, range, bucketing };
}
