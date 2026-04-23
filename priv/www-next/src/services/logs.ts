import { getList, rangeHeader, type PagedResult } from './http';
import type { Usage } from '@/types/tmf';

const USAGE_BASE = '/usageManagement/v1/usage';
const HTTP_LOG = '/ocs/v1/log/http';

export interface UsageQuery {
  /**
   * ISO8601 lower bound for the `date` field. The SigScale `usageManagement`
   * endpoint does NOT support `date.gte`/`date.lte` query params nor inside
   * the Vaadin filter expression — it only matches `date=<prefix>` (e.g.
   * `2024-04-23` matches all records on that day). For arbitrary windows we
   * filter client-side; the field is kept on the query interface for the
   * caller's bookkeeping.
   */
  from?: string;
  /** ISO8601 upper bound; same caveat as `from`. */
  to?: string;
  /** Filter by a usageCharacteristic field (server-side, Vaadin syntax). */
  characteristic?: { name: string; value: string };
}

/**
 * SigScale's `usage` filter only accepts a small allowlist of characteristic
 * paths server-side (`nasIdentifier`, `imsi`, `msisdn` per the legacy UI).
 * Filtering by `username` returns HTTP 500. We fall back to fetching a wide
 * page and clipping client-side via `matchesCharacteristic`.
 */
const SERVER_FILTERABLE = new Set(['nasIdentifier', 'imsi', 'msisdn']);

function buildFilter(query: UsageQuery | undefined): string | undefined {
  const c = query?.characteristic;
  if (!c?.value || !SERVER_FILTERABLE.has(c.name)) return undefined;
  return `"[{usageCharacteristic.contains=[{name=${c.name},value.like=[${c.value}%]}]}]"`;
}

function buildParams(type: string, query: UsageQuery | undefined): Record<string, string> {
  const params: Record<string, string> = { type };
  const filter = buildFilter(query);
  if (filter) params['filter'] = filter;
  return params;
}

/** Predicate used by callers that want to drop records outside a time window. */
export function withinRange(usage: Usage, from?: string, to?: string): boolean {
  if (!usage.date) return true;
  const ts = new Date(usage.date).getTime();
  if (Number.isNaN(ts)) return true;
  if (from && ts < new Date(from).getTime()) return false;
  if (to && ts > new Date(to).getTime()) return false;
  return true;
}

/**
 * Match a usage record by an arbitrary characteristic name + value (substring).
 * Used by the subscriber traffic dialog when the requested characteristic
 * isn't server-filterable (e.g. `username`).
 */
export function matchesCharacteristic(usage: Usage, name: string, value: string): boolean {
  if (!value) return true;
  const found = usage.usageCharacteristic?.find((c) => c.name === name);
  if (!found) return false;
  return String(found.value).includes(value);
}

/**
 * Identifying characteristics typically used to look up a subscriber in
 * accounting/access logs. Different SigScale deployments populate different
 * fields, so we check all of them and accept any match.
 */
export const SUBSCRIBER_ID_CHARS = [
  'username',
  'userName',
  'serviceIdentity',
  'msisdn',
  'imsi',
  'subscriptionId',
] as const;

/** True when *any* identity characteristic on `usage` contains `value`. */
export function matchesAnyIdentity(usage: Usage, value: string): boolean {
  if (!value) return true;
  for (const name of SUBSCRIBER_ID_CHARS) {
    const c = usage.usageCharacteristic?.find((x) => x.name === name);
    if (c && String(c.value).includes(value)) return true;
  }
  return false;
}

export const logsApi = {
  access(start = 0, end = 99, query?: UsageQuery): Promise<PagedResult<Usage>> {
    return getList<Usage>(USAGE_BASE, {
      headers: rangeHeader(start, end),
      params: buildParams('AAAAccessUsage', query),
    });
  },
  accounting(start = 0, end = 99, query?: UsageQuery): Promise<PagedResult<Usage>> {
    return getList<Usage>(USAGE_BASE, {
      headers: rangeHeader(start, end),
      params: buildParams('AAAAccountingUsage', query),
    });
  },
  http(start = 0, end = 99): Promise<PagedResult<unknown>> {
    return getList<unknown>(HTTP_LOG, { headers: rangeHeader(start, end) });
  },
};
