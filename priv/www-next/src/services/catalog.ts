import { http, getList, rangeHeader, encodePath, type PagedResult } from './http';
import type { ProductOffering } from '@/types/tmf';

const BASE = '/catalogManagement/v2';
const enc = encodePath;

export const catalogApi = {
  listOfferings(start = 0, end = 49): Promise<PagedResult<ProductOffering>> {
    return getList<ProductOffering>(`${BASE}/productOffering`, { headers: rangeHeader(start, end) });
  },
  /**
   * SigScale OCS does not implement GET /productOffering/{id}. The legacy
   * Polymer UI always populates the edit form from the list response, which
   * already contains the full offering payload (prices, prodSpecCharValueUse).
   *
   * To support deep links (`/catalog/:id`) we fall back to the list endpoint
   * with a Vaadin-style `id.like=[<id>]` filter and pull the first match.
   */
  async getOffering(id: string): Promise<ProductOffering> {
    const filter = `"[{id.like=[${id}]}]"`;
    const list = await getList<ProductOffering>(`${BASE}/productOffering`, {
      headers: rangeHeader(0, 0),
      params: { filter },
    });
    const found = list.items.find((o) => o.id === id) ?? list.items[0];
    if (!found) throw new Error(`Offering "${id}" not found`);
    return found;
  },
  createOffering(payload: Partial<ProductOffering>): Promise<ProductOffering> {
    return http.post<ProductOffering>(`${BASE}/productOffering`, payload).then((r) => r.data);
  },
  updateOffering(id: string, patch: Partial<ProductOffering>): Promise<ProductOffering> {
    return http
      .patch<ProductOffering>(`${BASE}/productOffering/${enc(id)}`, patch, {
        headers: { 'Content-Type': 'application/merge-patch+json' },
      })
      .then((r) => r.data);
  },
  deleteOffering(id: string): Promise<void> {
    return http.delete(`${BASE}/productOffering/${enc(id)}`).then(() => undefined);
  },
};
