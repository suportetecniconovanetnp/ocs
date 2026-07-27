import { describe, expect, it } from 'vitest';
import {
  buildOfferingPayload,
  emptyOffering,
  emptyPrice,
  parseOffering,
} from '@/services/offeringMapper';
import type { ProductOffering } from '@/types/tmf';

describe('offeringMapper monthly renewal day', () => {
  it('serializes recurring monthly prices with a fixed renewal day', () => {
    const form = emptyOffering();
    form.general.name = 'Monthly 30';
    form.prices.push({
      ...emptyPrice(),
      name: 'Monthly fee',
      type: 'recurring',
      period: 'monthly',
      monthDay: 30,
      amount: 10,
      currency: 'USD',
    });

    const payload = buildOfferingPayload(form);
    expect(payload.productOfferingPrice?.[0]).toMatchObject({
      priceType: 'recurring',
      recurringChargePeriod: 'monthly',
      recurringChargeDayOfMonth: 30,
    });
  });

  it('does not serialize a fixed renewal day for non-monthly recurring prices', () => {
    const form = emptyOffering();
    form.general.name = 'Weekly';
    form.prices.push({
      ...emptyPrice(),
      name: 'Weekly fee',
      type: 'recurring',
      period: 'weekly',
      monthDay: 30,
      amount: 10,
      currency: 'USD',
    });

    const payload = buildOfferingPayload(form);
    expect(payload.productOfferingPrice?.[0]).toMatchObject({
      priceType: 'recurring',
      recurringChargePeriod: 'weekly',
    });
    expect(payload.productOfferingPrice?.[0]?.recurringChargeDayOfMonth).toBeUndefined();
  });

  it('parses fixed monthly renewal days for prices and alterations', () => {
    const offering: ProductOffering = {
      id: 'offer-1',
      name: 'Offer 1',
      productOfferingPrice: [
        {
          name: 'Monthly fee',
          priceType: 'recurring',
          recurringChargePeriod: 'monthly',
          recurringChargeDayOfMonth: 30,
          productOfferPriceAlteration: {
            name: 'Allowance',
            priceType: 'recurring',
            recurringChargePeriod: 'monthly',
            recurringChargeDayOfMonth: 28,
          },
        },
      ],
    };

    const form = parseOffering(offering);
    expect(form.prices[0]?.monthDay).toBe(30);
    expect(form.alterations[0]?.monthDay).toBe(28);
  });
});
