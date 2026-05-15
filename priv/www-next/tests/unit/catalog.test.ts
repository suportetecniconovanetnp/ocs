import { describe, expect, it } from 'vitest';
import { normalizeOffering } from '@/services/catalog';
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
