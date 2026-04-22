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

export interface PagedResult<T> {
  items: T[];
  total?: number;
  contentRange?: { start: number; end: number; total?: number };
}

const RANGE_RE = /items\s+(\d+)-(\d+)\/(\d+|\*)/i;

function parseContentRange(header: string | undefined): PagedResult<unknown>['contentRange'] {
  if (!header) return undefined;
  const match = RANGE_RE.exec(header);
  if (!match) return undefined;
  const [, start, end, total] = match;
  return {
    start: Number(start),
    end: Number(end),
    total: total === '*' ? undefined : Number(total),
  };
}

export const http: AxiosInstance = axios.create({
  baseURL: '/',
  timeout: 30_000,
  headers: { Accept: 'application/json' },
  withCredentials: true,
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
  (error: AxiosError<ProblemDetails>) => {
    const status = error.response?.status ?? 0;
    const problem = error.response?.data;
    const message = problem?.detail ?? problem?.title ?? error.message;
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
    return {
      items: [],
      total: 0,
      contentRange: parseContentRange(response.headers['content-range'] as string | undefined),
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
