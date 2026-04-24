import { http, getList, rangeHeader, type PagedResult } from './http';
import type { AbmfEvent, HttpEvent, Usage } from '@/types/tmf';

const USAGE_BASE = '/usageManagement/v1/usage';
const HTTP_LOG = '/ocs/v1/log/http';
const ABMF_LOG = '/ocs/v1/log/balance';
const IPDR_FILES_BASE = '/ocs/v1/log/ipdr';

/** IPDR subtypes exposed by SigScale OCS. */
export type IpdrType = 'wlan' | 'voip';

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

/**
 * Vaadin-style filter expression builder for the ABMF log. Mirrors the
 * legacy `sig-balance-list.js` `_getBalances` filter composition: joins
 * multiple `path.like=[value]` clauses inside a single `[{...}]` array.
 *
 * Only path/value pairs with a non-empty value are emitted; passing an
 * empty object returns `undefined` so callers can drop the `filter`
 * param entirely instead of sending an empty expression the backend
 * would 400 on.
 */
function buildAbmfFilter(paths: Partial<Record<'type' | 'subscriber' | 'bucket' | 'units' | 'product', string>>): string | undefined {
  const clauses: string[] = [];
  for (const [path, value] of Object.entries(paths)) {
    if (value) clauses.push(`${path}.like=[${value}`);
  }
  if (clauses.length === 0) return undefined;
  return `"[{${clauses.join('],')}]}]"`;
}

export interface AbmfQuery {
  /** ISO date prefix (YYYY-MM-DD or fuller). Sent as the `date` query param. */
  date?: string;
  type?: string;
  subscriber?: string;
  bucket?: string;
  units?: string;
  product?: string;
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
  /**
   * Balance-management audit log. One record per top-up / adjustment /
   * reserve / debit / transfer event emitted by the ABMF. Filters mirror
   * the server-side allowlist in `ocs_rest_res_balance:get_balance_log/2`
   * (date, type, subscriber, bucket, units, product).
   */
  abmf(start = 0, end = 99, query?: AbmfQuery): Promise<PagedResult<AbmfEvent>> {
    const params: Record<string, string> = {};
    if (query?.date) params['date'] = query.date;
    const filter = query
      ? buildAbmfFilter({
          type: query.type,
          subscriber: query.subscriber,
          bucket: query.bucket,
          units: query.units,
          product: query.product,
        })
      : undefined;
    if (filter) params['filter'] = filter;
    return getList<AbmfEvent>(ABMF_LOG, {
      headers: rangeHeader(start, end),
      params,
    });
  },
  /**
   * inets HTTP access log (transfer_disk_log). The backend handler
   * (`ocs_rest_res_http:get_http/0`) takes no query params and ignores
   * Range headers — it always returns the latest `rest_page_size` items.
   * Pagination of this dataset is therefore client-side. We still pass a
   * range header for consistency with other log APIs; it's a no-op.
   */
  http(start = 0, end = 99): Promise<PagedResult<HttpEvent>> {
    return getList<HttpEvent>(HTTP_LOG, { headers: rangeHeader(start, end) });
  },
  /**
   * List IPDR log files stored on the OCS host. Backend at
   * `ocs_rest_res_usage:get_ipdr/2` walks the `ipdr_log_dir/{type}/`
   * directory and returns the filenames sorted newest-first. Each name
   * is an ISO-8601 timestamp of the rotation moment.
   */
  async ipdrFiles(type: IpdrType): Promise<string[]> {
    const resp = await http.get<string[]>(`${IPDR_FILES_BASE}/${type}`);
    return Array.isArray(resp.data) ? resp.data : [];
  },
  /**
   * Fetch one IPDR file's contents as TMF Usage records. Backend
   * supports the standard Range-header pagination through
   * `ocs_rest_res_usage:get_usages/4` with `Type=wlan|voip` and
   * `Id=<filename>`. Each record's fields live in
   * `usageCharacteristic` — the caller picks them out.
   *
   * IMPORTANT: the filename must go on the wire **un-encoded**. This
   * mirrors the legacy `sig-ipdr-list-{wlan,voip}.js` behaviour
   * (`ajax.url = "…/ipdr/wlan/" + event.model.item` — no encoder). The
   * SigScale inets+mod_ocs_rest_get routing appears to mishandle the
   * percent-encoded form (e.g. `%3A` for `:` in the ISO-8601 timestamp)
   * and returns a generic 500 HTML from inets itself instead of a
   * JSON 404/400 from the handler. We therefore DO NOT call
   * `encodePath` on the filename — the chars that appear in practice
   * (`-`, `:`, `.`, `T`, `Z`, digits) are all safe in URL path
   * segments per RFC 3986 §3.3 (`pchar = unreserved / pct-encoded /
   * sub-delims / ":" / "@"`).
   */
  ipdrRecords(
    type: IpdrType,
    file: string,
    start = 0,
    end = 999,
  ): Promise<PagedResult<Usage>> {
    return getList<Usage>(`${USAGE_BASE}/ipdr/${type}/${file}`, {
      headers: rangeHeader(start, end),
    });
  },
};
