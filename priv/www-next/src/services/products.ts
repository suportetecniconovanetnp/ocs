import {
  http,
  getList,
  rangeHeader,
  encodePath,
  parseContentRange,
  type PagedResult,
} from './http';
import type { Product } from '@/types/tmf';

const BASE = '/productInventoryManagement/v2/product';
const enc = encodePath;
const LIST_PAGE_SIZE = 200;

export const productsApi = {
  list(start = 0, end = 49): Promise<PagedResult<Product>> {
    return getList<Product>(BASE, { headers: rangeHeader(start, end) });
  },
  async listAll(): Promise<PagedResult<Product>> {
    const items: Product[] = [];
    let start = 0;
    let total: number | undefined;
    let etag: string | undefined;

    while (true) {
      const response = await http.get<Product[]>(BASE, {
        headers: {
          ...rangeHeader(start, start + LIST_PAGE_SIZE - 1),
          ...(etag && start > 0 ? { 'If-Range': etag } : {}),
        },
        validateStatus: (status) => (status >= 200 && status < 300) || status === 416,
      });
      const page: PagedResult<Product> = {
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
