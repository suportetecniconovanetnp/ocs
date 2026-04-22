import { http, getList, rangeHeader, type PagedResult } from './http';
import type { Service } from '@/types/tmf';

const BASE = '/serviceInventoryManagement/v2';

export const subscribersApi = {
  list(start = 0, end = 49, filter?: string): Promise<PagedResult<Service>> {
    return getList<Service>(`${BASE}/service`, {
      headers: rangeHeader(start, end),
      params: filter ? { filter } : undefined,
    });
  },
  get(id: string): Promise<Service> {
    return http.get<Service>(`${BASE}/service/${id}`).then((r) => r.data);
  },
  create(payload: Partial<Service>): Promise<Service> {
    return http.post<Service>(`${BASE}/service`, payload).then((r) => r.data);
  },
  update(id: string, patch: Partial<Service>): Promise<Service> {
    return http
      .patch<Service>(`${BASE}/service/${id}`, patch, {
        headers: { 'Content-Type': 'application/merge-patch+json' },
      })
      .then((r) => r.data);
  },
  delete(id: string): Promise<void> {
    return http.delete(`${BASE}/service/${id}`).then(() => undefined);
  },
};
