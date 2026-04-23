import { http, getList, rangeHeader, encodePath, type PagedResult } from './http';
import type { Bucket, Quantity } from '@/types/tmf';

const BASE = '/balanceManagement/v1';
const enc = encodePath;

/**
 * Build a SigScale/Vaadin-style filter expression.
 * Example: filterByProduct("724…") → `"[{product.id.like=[724…%]}]"`
 *
 * The legacy bucket-list uses iron-ajax with this exact syntax — quoted JSON-ish
 * string with bracketed list of `path.op=[value]` clauses, terminated with `%`.
 */
function filterByProduct(productId: string): string {
  return `"[{product.id.like=[${productId}%]}]"`;
}

export const balanceApi = {
  /**
   * List buckets, optionally filtered by product ID. SigScale doesn't expose
   * a /product/{id}/bucket route on every deployment, so we always hit
   * /bucket and pass the filter as a query parameter (matching the legacy
   * sig-bucket-list behaviour).
   */
  listBuckets(productId?: string, start = 0, end = 49): Promise<PagedResult<Bucket>> {
    return getList<Bucket>(`${BASE}/bucket`, {
      headers: rangeHeader(start, end),
      params: productId ? { filter: filterByProduct(productId) } : undefined,
    });
  },
  getBucket(id: string): Promise<Bucket> {
    return http.get<Bucket>(`${BASE}/bucket/${enc(id)}`).then((r) => r.data);
  },
  deleteBucket(id: string): Promise<void> {
    return http.delete(`${BASE}/bucket/${enc(id)}`).then(() => undefined);
  },
  topup(productId: string, amount: Quantity): Promise<unknown> {
    return http
      .post(`${BASE}/product/${enc(productId)}/balanceTopup`, {
        amount,
        product: {
          id: productId,
          href: `/productInventoryManagement/v2/product/${enc(productId)}`,
        },
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
