import type { ProductOfferingPrice } from '@/types/tmf';
import type { PriceUnit } from './useUnitOfMeasure';
import type { ProductSpecKind } from '@/services/offeringMapper';

/**
 * Cross-field validation rules for offerings, ported from the legacy
 * sig-offer-add.js _check* handlers (`_checkProductSpec`, `_checkPattern`,
 * `_checkRecurring`, `_checkPatternAlt`, `_checkRecurringAlt`).
 *
 * The SigScale OCS backend rejects offerings with semantically invalid
 * field combinations (e.g. `recurringChargePeriod` on a `usage` price).
 * The legacy UI prevents this by disabling fields based on selections;
 * we mirror those rules here as pure predicates so both the form dialogs
 * and the payload mapper can stay consistent.
 */

export type PriceType = NonNullable<ProductOfferingPrice['priceType']>;
type MaybeType = PriceType | '' | undefined;

/* ---- Price/Alteration type → which fields are valid ---- */

export function isPeriodAllowed(type: MaybeType): boolean {
  return type === 'recurring';
}

export function isPlaAllowed(type: MaybeType): boolean {
  return type === 'tariff';
}

export function isAmountAllowed(type: MaybeType): boolean {
  // Tariff prices are computed by the PLA; everything else allows a fixed amount.
  return type !== 'tariff';
}

/* ---- Price unit → which reserve fields apply ---- */

export function isReserveTimeAllowed(unit: PriceUnit): boolean {
  return unit === 's';
}

export function isReserveOctetsAllowed(unit: PriceUnit): boolean {
  return unit === 'b';
}

/* ---- Price type + product spec → allowed price units ---- */

const SPEC_USAGE_UNITS: Record<Exclude<ProductSpecKind, ''>, PriceUnit[]> = {
  data: ['b', 's'],
  voice: ['s'],
  sms: ['msg'],
};

export function allowedPriceUnits(type: MaybeType, spec: ProductSpecKind): PriceUnit[] {
  if (type === 'recurring' || type === 'one time' || type === '') {
    // Recurring/one-time prices are flat fees in cents; usage units don't apply.
    return ['cents'];
  }
  // usage and tariff: depend on product spec
  if (!spec) return ['b', 's', 'msg', 'cents'];
  return SPEC_USAGE_UNITS[spec];
}

/**
 * Same as allowedPriceUnits but for alterations. The legacy
 * _checkRecurringAlt enables spec units on Recurring alterations
 * (unlike prices, where Recurring forces Cents). Cents is allowed
 * on One-Time alterations only.
 */
export function allowedAlterationUnits(type: MaybeType, spec: ProductSpecKind): PriceUnit[] {
  if (type === 'one time' || type === '') {
    return spec ? ['cents', ...SPEC_USAGE_UNITS[spec]] : ['cents', 'b', 's', 'msg'];
  }
  // Recurring + Usage (the only other alteration types) follow the spec.
  if (!spec) return ['b', 's', 'msg'];
  return SPEC_USAGE_UNITS[spec];
}

export function defaultUnitFor(allowed: PriceUnit[], current: PriceUnit): PriceUnit {
  return allowed.includes(current) ? current : (allowed[0] ?? 'cents');
}

/* ---- Product spec → which offering-level characteristics apply ---- */

export function isReserveSessionTimeAllowed(spec: ProductSpecKind): boolean {
  // Data + Voice both meter session time; SMS is per-message.
  return spec === 'data' || spec === 'voice' || spec === '';
}

export function isReserveSessionOctetsAllowed(spec: ProductSpecKind): boolean {
  // Only Data sessions are byte-metered.
  return spec === 'data' || spec === '';
}

export function isPrefixTariffAllowed(spec: ProductSpecKind): boolean {
  // Voice + SMS use destination-prefix tariff tables; Data does not.
  return spec === 'voice' || spec === 'sms' || spec === '';
}

export function isRoamingTableAllowed(spec: ProductSpecKind): boolean {
  return spec === 'voice' || spec === 'sms' || spec === '';
}
