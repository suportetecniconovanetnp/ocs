import { beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogApi, normalizeOffering } from '@/services/catalog';
import { http, OcsApiError } from '@/services/http';
import type { ProductOffering } from '@/types/tmf';

describe('normalizeOffering', () => {
  it('prefers the canonical id encoded in href over a stale id field', () => {
    const offering = normalizeOffering({
      id: 'NOVATEL TURBO 17GB',
      name: 'NOVATEL TURBO 17GB',
      href: '/catalogManagement/v2/productOffering/offer-123',
    } as ProductOffering);

    expect(offering.id).toBe('offer-123');
  });

  it('decodes escaped path segments from href', () => {
    const offering = normalizeOffering({
      id: 'stale',
      name: 'Voice & Data (1G)',
      href: '/catalogManagement/v2/productOffering/Voice%20%26%20Data%20%281G%29',
    } as ProductOffering);

    expect(offering.id).toBe('Voice & Data (1G)');
  });
});

describe('catalogApi resource routing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the API-provided href when deleting an offering', async () => {
    const del = vi.spyOn(http, 'delete').mockResolvedValue({} as never);

    await catalogApi.deleteOffering({
      id: 'NOVATEL TURBO 17GB',
      href: '/productCatalogManagement/v2/productOffering/NOVATEL TURBO 17GB',
    });

    expect(del).toHaveBeenCalledWith(
      '/productCatalogManagement/v2/productOffering/NOVATEL TURBO 17GB',
    );
  });

  it('falls back to syncOffer remove when DELETE returns 404', async () => {
    vi.spyOn(http, 'delete').mockRejectedValue(new OcsApiError('404 missing', 404));
    const post = vi.spyOn(http, 'post').mockResolvedValue({} as never);

    await catalogApi.deleteOffering({
      id: 'NOVATEL TURBO 17GB',
      name: 'NOVATEL TURBO 17GB',
      href: '/productCatalogManagement/v2/productOffering/NOVATEL TURBO 17GB',
    });

    expect(post).toHaveBeenCalledWith('/productCatalogManagement/v2/syncOffer', {
      eventType: 'ProductOfferingRemoveNotification',
      event: {
        id: 'NOVATEL TURBO 17GB',
        name: 'NOVATEL TURBO 17GB',
        href: '/productCatalogManagement/v2/productOffering/NOVATEL TURBO 17GB',
      },
    });
  });
});
