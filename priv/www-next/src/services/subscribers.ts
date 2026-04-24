import { http, getList, rangeHeader, encodePath, type PagedResult } from './http';
import type { Service } from '@/types/tmf';

const BASE = '/serviceInventoryManagement/v2';
const enc = encodePath;

export const subscribersApi = {
  list(start = 0, end = 49, filter?: string): Promise<PagedResult<Service>> {
    return getList<Service>(`${BASE}/service`, {
      headers: rangeHeader(start, end),
      params: filter ? { filter } : undefined,
    });
  },
  get(id: string): Promise<Service> {
    return http.get<Service>(`${BASE}/service/${enc(id)}`).then((r) => r.data);
  },
  /**
   * `true` if a subscriber with that identity already exists on the backend,
   * `false` if the backend responded 404, `null` when reachability could not
   * be determined (network, 5xx, etc.). The 404 path is annotated with
   * X-OCS-Silent so the dev-mode interceptor doesn't pollute the console
   * with a fake error — the probe is deliberate.
   */
  async exists(id: string): Promise<boolean | null> {
    try {
      const response = await http.get<Service>(`${BASE}/service/${enc(id)}`, {
        headers: { 'X-OCS-Silent': '404' },
        validateStatus: (status) =>
          (status >= 200 && status < 300) || status === 404,
      });
      return response.status !== 404;
    } catch {
      return null;
    }
  },
  create(payload: Partial<Service>): Promise<Service> {
    return http.post<Service>(`${BASE}/service`, payload).then((r) => r.data);
  },
  update(id: string, patch: Partial<Service>): Promise<Service> {
    return http
      .patch<Service>(`${BASE}/service/${enc(id)}`, patch, {
        headers: { 'Content-Type': 'application/merge-patch+json' },
      })
      .then((r) => r.data);
  },
  delete(id: string): Promise<void> {
    return http.delete(`${BASE}/service/${enc(id)}`).then(() => undefined);
  },
};
