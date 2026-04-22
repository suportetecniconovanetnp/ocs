import { http, getList, rangeHeader, type PagedResult } from './http';
import type { Bucket, Quantity } from '@/types/tmf';

const BASE = '/balanceManagement/v1';

export const balanceApi = {
  listBuckets(productId?: string, start = 0, end = 49): Promise<PagedResult<Bucket>> {
    const url = productId ? `${BASE}/product/${productId}/bucket` : `${BASE}/bucket`;
    return getList<Bucket>(url, { headers: rangeHeader(start, end) });
  },
  getBucket(id: string): Promise<Bucket> {
    return http.get<Bucket>(`${BASE}/bucket/${id}`).then((r) => r.data);
  },
  deleteBucket(id: string): Promise<void> {
    return http.delete(`${BASE}/bucket/${id}`).then(() => undefined);
  },
  topup(productId: string, amount: Quantity): Promise<unknown> {
    return http
      .post(`${BASE}/product/${productId}/balanceTopup`, {
        amount,
        product: { id: productId, href: `/productInventoryManagement/v2/product/${productId}` },
      })
      .then((r) => r.data);
  },
  adjustment(productId: string, amount: Quantity): Promise<unknown> {
    return http
      .post(`${BASE}/balanceAdjustment`, {
        amount,
        product: { id: productId },
      })
      .then((r) => r.data);
  },
};
