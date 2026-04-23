import { http } from './http';

/**
 * SigScale OCS health check (RFC-style `application/health+json`).
 * Each `checks` key is an array of `{ componentId, observedValue, ... }`.
 */
export interface HealthCheckEntry {
  componentId: string;
  observedValue: number;
  observedUnit?: string;
  status?: 'pass' | 'fail' | 'warn';
}

export type HealthChecks = Record<string, HealthCheckEntry[]>;

export interface HealthResponse {
  status?: string;
  version?: string;
  releaseId?: string;
  serviceId?: string;
  description?: string;
  checks: HealthChecks;
}

export interface HealthFetchResult {
  data: HealthResponse;
  /** Seconds the response is valid for, parsed from `Cache-Control: max-age=N`. */
  maxAge: number;
}

const MAX_AGE_RE = /max-age=(\d+)/;

export const healthApi = {
  async get(): Promise<HealthFetchResult> {
    const response = await http.get<HealthResponse>('/health', {
      headers: { Accept: 'application/health+json, application/problem+json' },
    });
    const cc = (response.headers['cache-control'] as string | undefined) ?? '';
    const match = MAX_AGE_RE.exec(cc);
    const maxAge = match?.[1] ? parseInt(match[1], 10) : 60;
    return { data: response.data, maxAge };
  },
};

/* ------------------------------------------------------------------ *
 * Helpers to extract the numbers the legacy dashboard cards display
 * ------------------------------------------------------------------ */

export function sumCounters(entries: HealthCheckEntry[] | undefined): number {
  if (!entries) return 0;
  return entries.reduce((acc, e) => acc + (e.observedValue ?? 0), 0);
}

/**
 * Pick a single counter by `componentId` substring (legacy compares to
 * strings like `"CCA Result-Code: 2001"`).
 */
export function findCounter(
  entries: HealthCheckEntry[] | undefined,
  needle: string,
): number {
  if (!entries) return 0;
  const found = entries.find((e) => e.componentId === needle);
  return found?.observedValue ?? 0;
}

export function tableSize(checks: HealthChecks, table: string): number | undefined {
  const sizes = checks['table:size'];
  return sizes?.find((e) => e.componentId === table)?.observedValue;
}

/** Diameter applications the legacy dashboard tracks. */
export const DIAMETER_APPS = ['base', 'gx', 'ro', 'sta', 'swm'] as const;
export type DiameterApp = (typeof DIAMETER_APPS)[number];

/** Total messages (sum of counters) per application. */
export function diameterAppTotals(checks: HealthChecks): Record<DiameterApp, number> {
  const out = {} as Record<DiameterApp, number>;
  for (const app of DIAMETER_APPS) {
    out[app] = sumCounters(checks[`diameter-${app}:counters`]);
  }
  return out;
}

/** CCA Result-Code breakdown for Credit Control (Diameter Ro). */
export interface CcaBreakdown {
  success: number;        // 2001
  creditLimitReached: number; // 4012
  noServices: number;        // 5030
  endUserDenied: number;     // 4010
  ratingFailed: number;      // 5031
  unknownEndUser: number;    // 5012
}

export function ccaResults(checks: HealthChecks): CcaBreakdown {
  const ro = checks['diameter-ro:counters'];
  return {
    success: findCounter(ro, 'CCA Result-Code: 2001'),
    creditLimitReached: findCounter(ro, 'CCA Result-Code: 4012'),
    noServices: findCounter(ro, 'CCA Result-Code: 5030'),
    endUserDenied: findCounter(ro, 'CCA Result-Code: 4010'),
    ratingFailed: findCounter(ro, 'CCA Result-Code: 5031'),
    unknownEndUser: findCounter(ro, 'CCA Result-Code: 5012'),
  };
}

/** DEA Result-Code breakdown for AAA (Diameter STa). */
export interface DeaBreakdown {
  success: number;       // 2001
  multiRound: number;    // 1001
  authRejected: number;  // 5001
  unknownEndUser: number;// 5012
}

export function deaResults(checks: HealthChecks): DeaBreakdown {
  const sta = checks['diameter-sta:counters'];
  return {
    success: findCounter(sta, 'DEA Result-Code: 2001'),
    multiRound: findCounter(sta, 'DEA Result-Code: 1001'),
    authRejected: findCounter(sta, 'DEA Result-Code: 5001'),
    unknownEndUser: findCounter(sta, 'DEA Result-Code: 5012'),
  };
}

export function uptime(checks: HealthChecks): number | undefined {
  return checks['uptime']?.[0]?.observedValue;
}

export interface SchedulerSample {
  componentId: string;
  utilization: number;
}

export function schedulerUtilization(checks: HealthChecks): SchedulerSample[] {
  return (checks['scheduler:utilization'] ?? []).map((e) => ({
    componentId: e.componentId,
    utilization: e.observedValue ?? 0,
  }));
}
