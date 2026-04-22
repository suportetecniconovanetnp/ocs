import { http, getList, rangeHeader, type PagedResult } from './http';
import type { ProductOffering } from '@/types/tmf';

const BASE = '/catalogManagement/v2';

export const catalogApi = {
  listOfferings(start = 0, end = 49): Promise<PagedResult<ProductOffering>> {
    return getList<ProductOffering>(`${BASE}/productOffering`, { headers: rangeHeader(start, end) });
  },
  getOffering(id: string): Promise<ProductOffering> {
    return http.get<ProductOffering>(`${BASE}/productOffering/${id}`).then((r) => r.data);
  },
  createOffering(payload: Partial<ProductOffering>): Promise<ProductOffering> {
    return http.post<ProductOffering>(`${BASE}/productOffering`, payload).then((r) => r.data);
  },
  updateOffering(id: string, patch: Partial<ProductOffering>): Promise<ProductOffering> {
    return http
      .patch<ProductOffering>(`${BASE}/productOffering/${id}`, patch, {
        headers: { 'Content-Type': 'application/merge-patch+json' },
      })
      .then((r) => r.data);
  },
  deleteOffering(id: string): Promise<void> {
    return http.delete(`${BASE}/productOffering/${id}`).then(() => undefined);
  },
};
