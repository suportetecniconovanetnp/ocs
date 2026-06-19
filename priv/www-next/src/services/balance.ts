import {
  http,
  getList,
  rangeHeader,
  encodePath,
  parseContentRange,
  type PagedResult,
} from './http';
import type { Bucket, Quantity } from '@/types/tmf';

const BASE = '/balanceManagement/v1';
const enc = encodePath;
const LIST_PAGE_SIZE = 200;

/**
 * Optional validity window for a top-up or adjustment.
 * Both fields are ISO-8601 strings. The backend stores them on the
 * resulting bucket as `validFor.{startDateTime,endDateTime}`.
 */
export interface BalanceValidFor {
  startDateTime?: string;
  endDateTime?: string;
}

/** Drop empty fields so we never POST `validFor: {}`. */
function withValidFor(
  body: Record<string, unknown>,
  validFor: BalanceValidFor | undefined,
): Record<string, unknown> {
  if (!validFor) return body;
  const v: Record<string, string> = {};
  if (validFor.startDateTime) v.startDateTime = validFor.startDateTime;
  if (validFor.endDateTime) v.endDateTime = validFor.endDateTime;
  if (Object.keys(v).length === 0) return body;
  return { ...body, validFor: v };
}

export const balanceApi = {
  /**
   * List buckets. A `productId` filter is applied client-side by the caller
   * (typically BucketsView) — we do NOT push it into the Vaadin `?filter=`
   * query anymore because
   *   `"[{product.id.like=[<id>%]}]"`
   * crashes the SigScale endpoint with HTTP 500 whenever the value contains
   * special characters (hyphens, timestamps, etc.). Matches the defensive
   * strategy adopted for catalog/accounting logs.
   */
  listBuckets(_productId?: string, start = 0, end = 49): Promise<PagedResult<Bucket>> {
    return getList<Bucket>(`${BASE}/bucket`, {
      headers: rangeHeader(start, end),
    });
  },
  async listAllBuckets(_productId?: string): Promise<PagedResult<Bucket>> {
    const items: Bucket[] = [];
    let start = 0;
    let total: number | undefined;
    let etag: string | undefined;

    while (true) {
      const response = await http.get<Bucket[]>(`${BASE}/bucket`, {
        headers: {
          ...rangeHeader(start, start + LIST_PAGE_SIZE - 1),
          ...(etag && start > 0 ? { 'If-Range': etag } : {}),
        },
        validateStatus: (status) => (status >= 200 && status < 300) || status === 416,
      });
      const page: PagedResult<Bucket> = {
        items: response.status === 416 ? [] : response.data,
        total: undefined,
        contentRange: parseContentRange(response.headers['content-range'] as string | undefined),
      };
      etag = (response.headers['etag'] as string | undefined) ?? etag;
      items.push(...page.items);
      total = page.contentRange?.total ?? page.total ?? total;

      if (!page.items.length) break;
      if (typeof total === 'number' && items.length >= total) break;
      if (page.items.length < LIST_PAGE_SIZE) break;

      start += LIST_PAGE_SIZE;
    }

    return {
      items,
      total: total ?? items.length,
      contentRange: items.length
        ? { start: 0, end: items.length - 1, total: total ?? items.length }
        : { start: 0, end: 0, total: total ?? 0 },
    };
  },
  getBucket(id: string): Promise<Bucket> {
    return http.get<Bucket>(`${BASE}/bucket/${enc(id)}`).then((r) => r.data);
  },
  deleteBucket(id: string): Promise<void> {
    return http.delete(`${BASE}/bucket/${enc(id)}`).then(() => undefined);
  },
  topup(
    productId: string,
    amount: Quantity,
    validFor?: BalanceValidFor,
  ): Promise<unknown> {
    const body = withValidFor(
      {
        amount,
        product: {
          id: productId,
          href: `/productInventoryManagement/v2/product/${enc(productId)}`,
        },
      },
      validFor,
    );
    return http
      .post(`${BASE}/product/${enc(productId)}/balanceTopup`, body)
      .then((r) => r.data);
  },
  adjustment(
    productId: string,
    amount: Quantity,
    validFor?: BalanceValidFor,
  ): Promise<unknown> {
    const body = withValidFor(
      {
        // Legacy sig-sub-add sends `type: "buckettype"` — without it the
        // SigScale endpoint rejects or silently discards the adjustment.
        type: 'buckettype',
        amount,
        product: {
          id: productId,
          href: `/productInventoryManagement/v2/product/${enc(productId)}`,
        },
      },
      validFor,
    );
    return http.post(`${BASE}/balanceAdjustment`, body).then((r) => r.data);
  },
};
