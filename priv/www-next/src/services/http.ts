import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/auth';

export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  cause?: string;
  invalidParams?: { param: string; reason: string }[];
}

export class OcsApiError extends Error {
  readonly status: number;
  readonly problem?: ProblemDetails;

  constructor(message: string, status: number, problem?: ProblemDetails) {
    super(message);
    this.name = 'OcsApiError';
    this.status = status;
    this.problem = problem;
  }
}

/**
 * Strict path-segment encoder for SigScale OCS REST endpoints.
 *
 * `encodeURIComponent` leaves `(`, `)`, `!`, `*`, `'` unescaped — the SigScale
 * Erlang HTTP server (mochiweb/inets) treats unencoded `(` and `)` as syntax
 * errors when reaching the catalog router, returning a 404. This wrapper
 * percent-encodes them so identifiers like `Voice & Data (1G)` round-trip.
 */
export function encodePath(segment: string): string {
  return encodeURIComponent(segment).replace(/[!'()*]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export interface PagedResult<T> {
  items: T[];
  total?: number;
  contentRange?: { start: number; end: number; total?: number };
}

const RANGE_RE = /items\s+(\d+)-(\d+)\/(\d+|\*)/i;
const UNSATISFIABLE_RANGE_RE = /items\s+\*\/(\d+|\*)/i;

export function parseContentRange(header: string | undefined): PagedResult<unknown>['contentRange'] {
  if (!header) return undefined;
  const match = RANGE_RE.exec(header);
  if (match) {
    const [, start, end, total] = match;
    return {
      start: Number(start),
      end: Number(end),
      total: total === '*' ? undefined : Number(total),
    };
  }

  const unsatisfiable = UNSATISFIABLE_RANGE_RE.exec(header);
  if (!unsatisfiable) return undefined;
  const [, total] = unsatisfiable;
  const parsedTotal = total === '*' ? undefined : Number(total);
  return {
    start: 0,
    end: 0,
    total: parsedTotal,
  };
}

/**
 * SigScale's Vaadin-style filter expressions contain `[ ] { } =` chars that
 * its URL parser rejects when percent-encoded (the legacy `iron-ajax` keeps
 * them raw). Axios's default `URLSearchParams` encodes everything aggressively,
 * which yields HTTP 400 from `/usageManagement/v1/usage?filter=...`.
 *
 * This serializer leaves the filter-syntax characters intact and only escapes
 * the chars that would actually break URL parsing (`& # ? + space`).
 */
function ocsParamsSerializer(params: Record<string, unknown>): string {
  const safeEncode = (raw: string) =>
    raw
      .replace(/%/g, '%25')
      .replace(/&/g, '%26')
      .replace(/#/g, '%23')
      .replace(/\?/g, '%3F')
      .replace(/\+/g, '%2B')
      .replace(/ /g, '%20');
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${safeEncode(String(v))}`)
    .join('&');
}

export const http: AxiosInstance = axios.create({
  baseURL: '/',
  timeout: 30_000,
  headers: { Accept: 'application/json' },
  withCredentials: true,
  paramsSerializer: ocsParamsSerializer,
});

http.interceptors.request.use((config) => {
  const auth = useAuthStore();
  if (auth.baseUrl) {
    if (import.meta.env.DEV) {
      // Route through Vite's dynamic proxy to avoid CORS during development.
      config.baseURL = '/__ocs';
      config.headers.set('X-OCS-Target', auth.baseUrl);
    } else {
      config.baseURL = auth.baseUrl;
    }
  }
  if (auth.authHeader) {
    config.headers.set('Authorization', auth.authHeader);
  }
  return config;
});

http.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ProblemDetails | string>) => {
    const status = error.response?.status ?? 0;
    const data = error.response?.data;
    // Requests that know a 4xx is an expected outcome (e.g. a 404 used as a
    // "not found" probe) set `X-OCS-Silent: 404` on the request config so the
    // interceptor skips the noisy console dump.
    const cfg = error.config;
    const silentHeader = (cfg?.headers as Record<string, unknown> | undefined)?.[
      'X-OCS-Silent'
    ];
    const silentFor = typeof silentHeader === 'string' ? silentHeader.split(',') : [];
    const shouldLog = !silentFor.includes(String(status));
    let problem: ProblemDetails | undefined;
    let message: string;
    if (data && typeof data === 'object') {
      problem = data;
      message = problem.detail ?? problem.title ?? problem.cause ?? error.message;
      if (problem.invalidParams?.length) {
        const params = problem.invalidParams.map((p) => `${p.param}: ${p.reason}`).join('; ');
        message = `${message} (${params})`;
      }
    } else if (typeof data === 'string' && data.trim()) {
      // Some SigScale endpoints return plain-text errors instead of JSON
      message = data.length > 200 ? `${data.slice(0, 200)}…` : data;
    } else {
      message = error.message;
    }
    if (status) message = `${status} ${message}`;

    // Surface request/response details in the dev console so 4xx failures
    // can be diagnosed without opening DevTools network panel.
    if (import.meta.env.DEV && status >= 400 && shouldLog) {
      const method = cfg?.method?.toUpperCase() ?? 'REQ';
      const url = cfg?.url ?? '';
      const reqBody = typeof cfg?.data === 'string' ? cfg.data : JSON.stringify(cfg?.data);
      const resBody =
        data === undefined || data === null
          ? '<empty>'
          : typeof data === 'string'
            ? data
            : JSON.stringify(data);
      const ct = (error.response?.headers as Record<string, string> | undefined)?.['content-type'];
      console.error(
        `[OCS API] ${method} ${url} -> ${status}\n` +
          `  request:  ${reqBody}\n` +
          `  response: ${resBody}\n` +
          `  content-type: ${ct ?? '<none>'}`,
      );
    }

    return Promise.reject(new OcsApiError(message, status, problem));
  },
);

export async function getList<T>(url: string, config?: AxiosRequestConfig): Promise<PagedResult<T>> {
  // SigScale OCS returns 416 (Requested Range Not Satisfiable) when the
  // collection is empty or the requested range is past the end. Treat it
  // as a successful empty response instead of an error.
  const response = await http.get<T[]>(url, {
    ...config,
    validateStatus: (status) => (status >= 200 && status < 300) || status === 416,
  });
  if (response.status === 416) {
    const contentRange = parseContentRange(response.headers['content-range'] as string | undefined);
    return {
      items: [],
      total: contentRange?.total ?? 0,
      contentRange,
    };
  }
  return {
    items: response.data,
    total: Number(response.headers['x-total-count']) || undefined,
    contentRange: parseContentRange(response.headers['content-range'] as string | undefined),
  };
}

/**
 * Build the `Range: items=N-M` header used by SigScale OCS list endpoints.
 * Callers pass zero-indexed start/end (`0-49` for the first page of 50);
 * the SigScale backend uses one-indexed ranges, so we shift by +1 here.
 * Asking for `items=0-49` gets a 416 from the backend — `items=1-50` is correct.
 */
export function rangeHeader(start: number, end: number): Record<string, string> {
  return { Range: `items=${start + 1}-${end + 1}` };
}

/**
 * Lightweight connectivity probe used by the login screen. Tries a cheap GET
 * against a known TMF list endpoint with `items=0-0` so a successful response
 * proves both base URL and credentials.
 */
export async function probeConnection(
  baseUrl: string,
  username: string,
  password: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  try {
    const cleanBase = baseUrl.replace(/\/+$/, '');
    const path = '/serviceInventoryManagement/v2/service';
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Basic ${btoa(`${username}:${password}`)}`,
      Range: 'items=1-1',
    };
    let target: string;
    if (import.meta.env.DEV) {
      target = `/__ocs${path}`;
      headers['X-OCS-Target'] = cleanBase;
    } else {
      target = cleanBase + path;
    }
    const response = await axios.get(target, {
      timeout: 10_000,
      headers,
      withCredentials: true,
      validateStatus: () => true,
    });
    if (response.status >= 200 && response.status < 300) return { ok: true };
    // 416 = empty list with Range header — backend reachable, auth ok.
    if (response.status === 416) return { ok: true };
    return {
      ok: false,
      status: response.status,
      message: response.statusText || `HTTP ${response.status}`,
    };
  } catch (e) {
    const err = e as AxiosError;
    return { ok: false, status: 0, message: err.message };
  }
}
