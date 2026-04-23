import { http, getList, rangeHeader, encodePath, type PagedResult } from './http';
import type { Product } from '@/types/tmf';

const BASE = '/productInventoryManagement/v2/product';
const enc = encodePath;

export const productsApi = {
  list(start = 0, end = 49): Promise<PagedResult<Product>> {
    return getList<Product>(BASE, { headers: rangeHeader(start, end) });
  },
  get(id: string): Promise<Product> {
    return http.get<Product>(`${BASE}/${enc(id)}`).then((r) => r.data);
  },
  create(payload: Partial<Product>): Promise<Product> {
    return http.post<Product>(BASE, payload).then((r) => r.data);
  },
  delete(id: string): Promise<void> {
    return http.delete(`${BASE}/${enc(id)}`).then(() => undefined);
  },
};
