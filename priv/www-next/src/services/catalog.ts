import { http, getList, rangeHeader, encodePath, type PagedResult } from './http';
import type { ProductOffering } from '@/types/tmf';

const BASE = '/catalogManagement/v2';
const enc = encodePath;

function offeringIdFromHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  const raw = href.split('/').pop();
  return raw ? decodeURIComponent(raw) : undefined;
}

export function normalizeOffering(offering: ProductOffering): ProductOffering {
  const id = offeringIdFromHref(offering.href) ?? offering.id ?? offering.name;
  return { ...offering, id };
}

export const catalogApi = {
  async listOfferings(start = 0, end = 49): Promise<PagedResult<ProductOffering>> {
    const result = await getList<ProductOffering>(`${BASE}/productOffering`, {
      headers: rangeHeader(start, end),
    });
    return {
      ...result,
      items: result.items.map(normalizeOffering),
    };
  },
  /**
   * SigScale OCS does not implement GET /productOffering/{id}. The legacy
   * Polymer UI always populates the edit form from the list response (which
   * already contains the full offering payload — prices and
   * prodSpecCharValueUse), and the Vaadin-style `id.like=[<value>%]` filter
   * crashes the backend with a 500 when the value contains characters like
   * `-` or when the trailing `%` wildcard is missing.
   *
   * To stay backend-agnostic we paginate the unfiltered list and find the
   * matching id client-side. Catalogs are typically small (dozens of
   * offerings), so the cost is negligible.
   */
  async getOffering(id: string): Promise<ProductOffering> {
    const PAGE = 50;
    let start = 0;
    while (true) {
      const list = await getList<ProductOffering>(`${BASE}/productOffering`, {
        headers: rangeHeader(start, start + PAGE - 1),
      });
      const found = list.items.map(normalizeOffering).find((o) => o.id === id);
      if (found) return found;
      if (list.items.length < PAGE) break; // exhausted
      start += PAGE;
    }
    throw new Error(`Offering "${id}" not found`);
  },
  createOffering(payload: Partial<ProductOffering>): Promise<ProductOffering> {
    return http
      .post<ProductOffering>(`${BASE}/productOffering`, payload)
      .then((r) => normalizeOffering(r.data));
  },
  updateOffering(id: string, patch: Partial<ProductOffering>): Promise<ProductOffering> {
    return http
      .patch<ProductOffering>(`${BASE}/productOffering/${enc(id)}`, patch, {
        headers: { 'Content-Type': 'application/merge-patch+json' },
      })
      .then((r) => normalizeOffering(r.data));
  },
  deleteOffering(id: string): Promise<void> {
    return http.delete(`${BASE}/productOffering/${enc(id)}`).then(() => undefined);
  },
};
