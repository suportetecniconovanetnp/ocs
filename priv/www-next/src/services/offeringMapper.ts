import type {
  ProductOffering,
  ProductOfferingPrice,
  ProductOfferPriceAlteration,
  ProdSpecCharValueUse,
  ValidFor,
  PriceTaxIncluded,
} from '@/types/tmf';
import { buildUnitOfMeasure, parseUnitOfMeasure, type PriceUnit } from '@/composables/useUnitOfMeasure';
import { parseDuration, formatDuration } from '@/composables/useDuration';
import { backendDateToLocalInput, localInputToBackendDate } from '@/dateTime';
import {
  isPeriodAllowed,
  isPlaAllowed,
  isAmountAllowed,
  isReserveTimeAllowed,
  isReserveOctetsAllowed,
  isReserveSessionTimeAllowed,
  isReserveSessionOctetsAllowed,
  isPrefixTariffAllowed,
  isRoamingTableAllowed,
} from '@/composables/useOfferingRules';

/* ------------------------------------------------------------------ *
 * Form shapes used by the dialogs. They mirror the legacy field set
 * but stay flat for easy v-model binding.
 * ------------------------------------------------------------------ */

export type ProductSpecKind = 'data' | 'voice' | 'sms' | '';

export interface OfferingFormGeneral {
  name: string;
  description: string;
  productSpec: ProductSpecKind;
  isBundle: boolean;
  bundledIds: string[];
  startDate: string;
  endDate: string;
  lifecycleStatus: string;
}

export interface OfferingFormCharacteristics {
  reserveSessionTime: string;
  reserveSessionOctets: string;
  redirectAddress: string;
  policyTable: string;
}

export interface PriceAlterationForm {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  type: ProductOfferingPrice['priceType'] | '';
  unit: PriceUnit;
  size: string;
  amount: number | null;
  currency: string;
  period: string;
}

export interface PriceForm {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  type: ProductOfferingPrice['priceType'] | '';
  pla: string;
  unit: PriceUnit;
  size: string;
  amount: number | null;
  currency: string;
  period: string;
  alterationName: string;
  fixedPriceBucket: boolean;
  callDirectionIn: boolean;
  callDirectionOut: boolean;
  prefixTariff: string;
  roamingTable: string;
  chargingKey: string;
  todStart: string;
  todEnd: string;
  reserveTime: string;
  reserveOctets: string;
}

export interface OfferingForm {
  general: OfferingFormGeneral;
  characteristics: OfferingFormCharacteristics;
  prices: PriceForm[];
  alterations: PriceAlterationForm[];
}

/* ------------------------------------------------------------------ *
 * Defaults
 * ------------------------------------------------------------------ */

export function emptyOffering(): OfferingForm {
  return {
    general: {
      name: '',
      description: '',
      productSpec: '',
      isBundle: false,
      bundledIds: [],
      startDate: '',
      endDate: '',
      lifecycleStatus: 'Active',
    },
    characteristics: {
      reserveSessionTime: '',
      reserveSessionOctets: '',
      redirectAddress: '',
      policyTable: '',
    },
    prices: [],
    alterations: [],
  };
}

export function emptyPrice(): PriceForm {
  return {
    name: '',
    description: '',
    startDate: '',
    endDate: '',
    type: '',
    pla: '',
    unit: 'cents',
    size: '',
    amount: null,
    currency: '',
    period: '',
    alterationName: '',
    fixedPriceBucket: false,
    callDirectionIn: false,
    callDirectionOut: false,
    prefixTariff: '',
    roamingTable: '',
    chargingKey: '',
    todStart: '',
    todEnd: '',
    reserveTime: '',
    reserveOctets: '',
  };
}

export function emptyAlteration(): PriceAlterationForm {
  return {
    name: '',
    description: '',
    startDate: '',
    endDate: '',
    type: '',
    unit: 'cents',
    size: '',
    amount: null,
    currency: '',
    period: '',
  };
}

/* ------------------------------------------------------------------ *
 * Build payload for POST/PATCH
 * ------------------------------------------------------------------ */

// Only id + href — the legacy sig-offer-add does NOT send `name` and the
// SigScale schema validator rejects unexpected keys with 400.
const PRODUCT_SPEC_REFS: Record<Exclude<ProductSpecKind, ''>, { id: string; href: string }> = {
  data: { id: '8', href: '/catalogManagement/v2/productSpecification/8' },
  voice: { id: '9', href: '/catalogManagement/v2/productSpecification/9' },
  sms: { id: '11', href: '/catalogManagement/v2/productSpecification/11' },
};

const SPEC_REF_RADIUS = { id: '1', href: '/catalogManagement/v2/productSpecification/1' };
const SPEC_REF_TIME = { id: '3', href: '/catalogManagement/v2/productSpecification/3' };
const SPEC_REF_TARIFF = { id: '5', href: '/catalogManagement/v2/productSpecification/5' };

function maybeValidFor(start: string, end: string): ValidFor | undefined {
  const startDateTime = localInputToBackendDate(start);
  const endDateTime = localInputToBackendDate(end);
  if (startDateTime && endDateTime) return { startDateTime, endDateTime };
  if (startDateTime) return { startDateTime };
  if (endDateTime) return { endDateTime };
  return undefined;
}

function maybePrice(amount: number | null | undefined, currency: string): PriceTaxIncluded | undefined {
  const hasAmount = typeof amount === 'number' && !Number.isNaN(amount);
  if (hasAmount && currency) return { taxIncludedAmount: amount, currencyCode: currency };
  if (hasAmount) return { taxIncludedAmount: amount };
  if (currency) return { currencyCode: currency };
  return undefined;
}

function reserveSessionTimeChar(input: string): ProdSpecCharValueUse | undefined {
  if (!input) return undefined;
  const last = input.charAt(input.length - 1).toLowerCase();
  const hasUnit = ['s', 'm', 'h', 'd'].includes(last);
  const numericPart = hasUnit ? input.slice(0, -1) : input;
  const value = parseInt(numericPart, 10);
  if (!Number.isFinite(value)) return undefined;
  return {
    name: 'radiusReserveSessionTime',
    minCardinality: 0,
    maxCardinality: 1,
    productSpecCharacteristicValue: [
      { default: true, value, unitOfMeasure: last === 'm' ? 'minutes' : 'seconds' },
    ],
    productSpecification: SPEC_REF_RADIUS,
  };
}

function reserveSessionOctetsChar(input: string): ProdSpecCharValueUse | undefined {
  if (!input) return undefined;
  const last = input.charAt(input.length - 1).toLowerCase();
  const numericPart = ['b', 'k', 'm', 'g'].includes(last) ? input.slice(0, -1) : input;
  const value = parseInt(numericPart, 10);
  if (!Number.isFinite(value)) return undefined;
  const unit =
    last === 'k' ? 'kilobytes' : last === 'm' ? 'megabytes' : last === 'g' ? 'gigabytes' : 'bytes';
  return {
    name: 'radiusReserveSessionOctets',
    minCardinality: 0,
    maxCardinality: 1,
    productSpecCharacteristicValue: [{ default: true, value, unitOfMeasure: unit }],
    productSpecification: SPEC_REF_RADIUS,
  };
}

function singleStringChar(name: string, value: string, ref = SPEC_REF_TARIFF): ProdSpecCharValueUse | undefined {
  if (!value) return undefined;
  return {
    name,
    minCardinality: 0,
    maxCardinality: 1,
    productSpecCharacteristicValue: [{ default: true, value }],
    productSpecification: ref,
  };
}

function buildAlterationPayload(a: PriceAlterationForm): ProductOfferPriceAlteration {
  const alteration: ProductOfferPriceAlteration = {};
  if (a.name) alteration.name = a.name;
  if (a.description) alteration.description = a.description;
  const validFor = maybeValidFor(a.startDate, a.endDate);
  if (validFor) alteration.validFor = validFor;
  if (a.type) alteration.priceType = a.type;
  const uom = buildUnitOfMeasure(a.unit, a.size);
  if (uom) alteration.unitOfMeasure = uom;
  if (isAmountAllowed(a.type)) {
    const price = maybePrice(a.amount, a.currency);
    if (price) alteration.price = price;
  }
  if (isPeriodAllowed(a.type) && a.period) alteration.recurringChargePeriod = a.period;
  return alteration;
}

function buildPricePayload(
  price: PriceForm,
  alterations: PriceAlterationForm[],
  spec: ProductSpecKind,
): ProductOfferingPrice {
  const out: ProductOfferingPrice = { name: price.name };
  if (price.description) out.description = price.description;
  const validFor = maybeValidFor(price.startDate, price.endDate);
  if (validFor) out.validFor = validFor;
  if (price.type) out.priceType = price.type;
  if (isPlaAllowed(price.type) && price.pla) {
    out.pricingLogicAlgorithm = [{ href: price.pla }];
  }
  const uom = buildUnitOfMeasure(price.unit, price.size);
  if (uom) out.unitOfMeasure = uom;
  if (isAmountAllowed(price.type)) {
    const priceObj = maybePrice(price.amount, price.currency);
    if (priceObj) out.price = priceObj;
  }
  if (isPeriodAllowed(price.type) && price.period) out.recurringChargePeriod = price.period;

  if (price.alterationName) {
    const alt = alterations.find((a) => a.name === price.alterationName);
    if (alt) out.productOfferPriceAlteration = buildAlterationPayload(alt);
  }

  const chars: ProdSpecCharValueUse[] = [];
  if (isPrefixTariffAllowed(spec)) {
    const tariff = singleStringChar('destPrefixTariffTable', price.prefixTariff);
    if (tariff) chars.push(tariff);
  }
  if (isRoamingTableAllowed(spec)) {
    const roaming = singleStringChar('roamingTable', price.roamingTable);
    if (roaming) chars.push(roaming);
  }
  if (price.chargingKey) {
    const key = parseInt(price.chargingKey, 10);
    if (Number.isFinite(key)) {
      chars.push({
        name: 'chargingKey',
        minCardinality: 0,
        maxCardinality: 1,
        productSpecCharacteristicValue: [{ default: true, value: key }],
        productSpecification: SPEC_REF_TARIFF,
      });
    }
  }
  // Call direction: only set when exactly one is checked
  if (price.callDirectionIn && !price.callDirectionOut) {
    chars.push({
      name: 'callDirection',
      minCardinality: 1,
      maxCardinality: 1,
      productSpecCharacteristicValue: [{ default: true, value: 'answer' }],
      productSpecification: SPEC_REF_TARIFF,
    });
  } else if (price.callDirectionOut && !price.callDirectionIn) {
    chars.push({
      name: 'callDirection',
      minCardinality: 1,
      maxCardinality: 1,
      productSpecCharacteristicValue: [{ default: true, value: 'originate' }],
      productSpecification: SPEC_REF_TARIFF,
    });
  }
  if (price.fixedPriceBucket) {
    chars.push({
      name: 'fixedPriceBucket',
      productSpecCharacteristicValue: [{ value: true, valueType: 'boolean' }],
      productSpecification: SPEC_REF_TIME,
    });
  }
  // Time of day range — Range value with low/up amount in hours.
  if (price.todStart && price.todEnd) {
    chars.push({
      name: 'timeOfDayRange',
      minCardinality: 0,
      maxCardinality: 1,
      productSpecCharacteristicValue: [
        {
          value: {
            lowerValue: { amount: price.todStart, units: 'hours' },
            upperValue: { amount: price.todEnd, units: 'hours' },
          } as unknown as string, // TMF allows complex value object here
        },
      ],
      productSpecification: SPEC_REF_TIME,
    });
  }
  // Reserve time/octets only apply to seconds/bytes priced units respectively.
  if (isReserveTimeAllowed(price.unit)) {
    const reserveTimeSec = parseDuration(price.reserveTime);
    if (reserveTimeSec !== undefined) {
      chars.push({
        name: 'radiusReserveTime',
        minCardinality: 0,
        maxCardinality: 1,
        productSpecCharacteristicValue: [
          { default: true, value: reserveTimeSec, unitOfMeasure: 'seconds' },
        ],
        productSpecification: SPEC_REF_RADIUS,
      });
    }
  }
  if (isReserveOctetsAllowed(price.unit) && price.reserveOctets) {
    const octets = parseInt(price.reserveOctets, 10);
    if (Number.isFinite(octets)) {
      chars.push({
        name: 'radiusReserveOctets',
        minCardinality: 0,
        maxCardinality: 1,
        productSpecCharacteristicValue: [
          { default: true, value: octets, unitOfMeasure: 'bytes' },
        ],
        productSpecification: SPEC_REF_RADIUS,
      });
    }
  }
  if (chars.length) out.prodSpecCharValueUse = chars;
  return out;
}

export function buildOfferingPayload(form: OfferingForm): Partial<ProductOffering> {
  const out: Partial<ProductOffering> = { name: form.general.name };
  if (form.general.description) out.description = form.general.description;
  if (form.general.isBundle && form.general.bundledIds.length) {
    out.bundledProductOffering = form.general.bundledIds.map((id) => ({
      id,
      bundledProductOfferingOption: {
        numberRelOfferLowerLimit: 0,
        numberRelOfferUpperLimit: 1,
        numberRelOfferDefault: 1,
      },
    }));
  }
  if (form.general.productSpec) out.productSpecification = PRODUCT_SPEC_REFS[form.general.productSpec];
  const validFor = maybeValidFor(form.general.startDate, form.general.endDate);
  if (validFor) out.validFor = validFor;
  if (form.general.lifecycleStatus) out.lifecycleStatus = form.general.lifecycleStatus as ProductOffering['lifecycleStatus'];

  const chars: ProdSpecCharValueUse[] = [];
  if (isReserveSessionTimeAllowed(form.general.productSpec)) {
    const reserveTime = reserveSessionTimeChar(form.characteristics.reserveSessionTime);
    if (reserveTime) chars.push(reserveTime);
  }
  if (isReserveSessionOctetsAllowed(form.general.productSpec)) {
    const reserveOctets = reserveSessionOctetsChar(form.characteristics.reserveSessionOctets);
    if (reserveOctets) chars.push(reserveOctets);
  }
  const redirect = singleStringChar('redirectServer', form.characteristics.redirectAddress, {
    id: '8',
    href: '/productCatalogManagement/v2/productSpecification/8',
  });
  if (redirect) chars.push(redirect);
  const policy = singleStringChar('policyTable', form.characteristics.policyTable);
  if (policy) chars.push(policy);
  if (chars.length) out.prodSpecCharValueUse = chars;

  // The legacy sig-offer-add always sets productOfferingPrice (even as []).
  // Some backends reject the offering when the field is missing entirely.
  out.productOfferingPrice = form.prices.map((p) =>
    buildPricePayload(p, form.alterations, form.general.productSpec),
  );
  return out;
}

/* ------------------------------------------------------------------ *
 * Parse an existing offering back into the form shape (for edit mode)
 * ------------------------------------------------------------------ */

function detectProductSpec(spec: ProductOffering['productSpecification']): ProductSpecKind {
  if (!spec) return '';
  if (spec.id === '8') return 'data';
  if (spec.id === '9') return 'voice';
  if (spec.id === '11') return 'sms';
  return '';
}

function charValue(chars: ProdSpecCharValueUse[] | undefined, name: string): unknown {
  return chars?.find((c) => c.name === name)?.productSpecCharacteristicValue?.[0]?.value;
}

function parseAlteration(a: ProductOfferPriceAlteration): PriceAlterationForm {
  const uom = parseUnitOfMeasure(a.unitOfMeasure);
  return {
    name: a.name ?? '',
    description: a.description ?? '',
    startDate: backendDateToLocalInput(a.validFor?.startDateTime),
    endDate: backendDateToLocalInput(a.validFor?.endDateTime),
    type: a.priceType ?? '',
    unit: uom.unit,
    size: uom.size,
    amount: a.price?.taxIncludedAmount ?? null,
    currency: a.price?.currencyCode ?? '',
    period: a.recurringChargePeriod ?? '',
  };
}

function parsePrice(p: ProductOfferingPrice): PriceForm {
  const { unit, size } = parseUnitOfMeasure(p.unitOfMeasure);
  const reserveTime = charValue(p.prodSpecCharValueUse, 'radiusReserveTime');
  const reserveOctets = charValue(p.prodSpecCharValueUse, 'radiusReserveOctets');
  const todRaw = charValue(p.prodSpecCharValueUse, 'timeOfDayRange') as
    | { lowerValue?: { amount?: string }; upperValue?: { amount?: string } }
    | string
    | undefined;
  let todStart = '';
  let todEnd = '';
  if (todRaw && typeof todRaw === 'object') {
    todStart = todRaw.lowerValue?.amount ?? '';
    todEnd = todRaw.upperValue?.amount ?? '';
  } else if (typeof todRaw === 'string' && todRaw.includes('-')) {
    const parts = todRaw.split('-');
    todStart = parts[0] ?? '';
    todEnd = parts[1] ?? '';
  }
  const callDir = String(charValue(p.prodSpecCharValueUse, 'callDirection') ?? '');
  return {
    name: p.name ?? '',
    description: p.description ?? '',
    startDate: backendDateToLocalInput(p.validFor?.startDateTime),
    endDate: backendDateToLocalInput(p.validFor?.endDateTime),
    type: p.priceType ?? '',
    pla: p.pricingLogicAlgorithm?.[0]?.href ?? '',
    unit,
    size,
    amount: p.price?.taxIncludedAmount ?? null,
    currency: p.price?.currencyCode ?? '',
    period: p.recurringChargePeriod ?? '',
    alterationName: p.productOfferPriceAlteration?.name ?? '',
    fixedPriceBucket: Boolean(charValue(p.prodSpecCharValueUse, 'fixedPriceBucket')),
    callDirectionIn: callDir === 'answer',
    callDirectionOut: callDir === 'originate',
    prefixTariff: String(charValue(p.prodSpecCharValueUse, 'destPrefixTariffTable') ?? ''),
    roamingTable: String(charValue(p.prodSpecCharValueUse, 'roamingTable') ?? ''),
    chargingKey: charValue(p.prodSpecCharValueUse, 'chargingKey')?.toString() ?? '',
    todStart,
    todEnd,
    reserveTime: typeof reserveTime === 'number' ? formatDuration(reserveTime) : '',
    reserveOctets: typeof reserveOctets === 'number' ? String(reserveOctets) : '',
  };
}

export function parseOffering(offering: ProductOffering): OfferingForm {
  const reserveTimeRaw = charValue(offering.prodSpecCharValueUse, 'radiusReserveSessionTime');
  const reserveOctetsRaw = charValue(offering.prodSpecCharValueUse, 'radiusReserveSessionOctets');
  const prices = offering.productOfferingPrice ?? [];
  // Deduplicate alterations by name across prices so the Alterations tab
  // shows them as a flat reusable list instead of repeating per-price.
  const seen = new Map<string, PriceAlterationForm>();
  for (const p of prices) {
    const a = p.productOfferPriceAlteration;
    if (a?.name && !seen.has(a.name)) {
      seen.set(a.name, parseAlteration(a));
    }
  }
  return {
    general: {
      name: offering.name,
      description: offering.description ?? '',
      productSpec: detectProductSpec(offering.productSpecification),
      isBundle: Boolean(offering.isBundle),
      bundledIds: offering.bundledProductOffering?.map((b) => b.id) ?? [],
      startDate: backendDateToLocalInput(offering.validFor?.startDateTime),
      endDate: backendDateToLocalInput(offering.validFor?.endDateTime),
      lifecycleStatus: offering.lifecycleStatus ?? 'Active',
    },
    characteristics: {
      reserveSessionTime: typeof reserveTimeRaw === 'number' ? String(reserveTimeRaw) : '',
      reserveSessionOctets: typeof reserveOctetsRaw === 'number' ? String(reserveOctetsRaw) : '',
      redirectAddress: String(charValue(offering.prodSpecCharValueUse, 'redirectServer') ?? ''),
      policyTable: String(charValue(offering.prodSpecCharValueUse, 'policyTable') ?? ''),
    },
    prices: prices.map(parsePrice),
    alterations: Array.from(seen.values()),
  };
}
