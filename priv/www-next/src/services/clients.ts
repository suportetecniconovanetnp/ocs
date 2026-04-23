import { http, getList, rangeHeader, encodePath, type PagedResult } from './http';
import type { Client } from '@/types/tmf';

const BASE = '/ocs/v1/client';
const enc = encodePath;

export const clientsApi = {
  list(start = 0, end = 49): Promise<PagedResult<Client>> {
    return getList<Client>(BASE, { headers: rangeHeader(start, end) });
  },
  get(id: string): Promise<Client> {
    return http.get<Client>(`${BASE}/${enc(id)}`).then((r) => r.data);
  },
  create(payload: Partial<Client>): Promise<Client> {
    return http.post<Client>(BASE, payload).then((r) => r.data);
  },
  update(id: string, patch: Partial<Client>): Promise<Client> {
    return http
      .patch<Client>(`${BASE}/${enc(id)}`, patch, {
        headers: { 'Content-Type': 'application/merge-patch+json' },
      })
      .then((r) => r.data);
  },
  delete(id: string): Promise<void> {
    return http.delete(`${BASE}/${enc(id)}`).then(() => undefined);
  },
};
