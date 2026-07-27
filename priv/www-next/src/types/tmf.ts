/**
 * Minimal TMF Forum / OCS API type surface.
 * Expand as service modules are migrated. Source of truth is the SigScale OCS
 * REST contracts (catalogManagement v2, serviceInventoryManagement v2,
 * productInventoryManagement v2, balanceManagement v1, resourceInventoryManagement v1).
 */

export type Iso8601 = string;
export type Money = { unit: string; value: number };

export interface Quantity {
  /**
   * SigScale serialises `amount` as a string with a unit suffix for non-cents
   * buckets ("1500b", "60s", "10msg") and as a number for cents.
   */
  amount: number | string;
  units: 'cents' | 'octets' | 'seconds' | 'messages' | string;
}

export interface RelatedParty {
  id: string;
  href?: string;
  role?: string;
  name?: string;
}

export interface Characteristic {
  name: string;
  value: unknown;
  valueType?: string;
}

export type LifecycleStatus =
  | 'In Study'
  | 'In Design'
  | 'In Test'
  | 'Active'
  | 'Rejected'
  | 'Launched'
  | 'Retired'
  | 'Obsolete';

export interface ValidFor {
  startDateTime?: Iso8601;
  endDateTime?: Iso8601;
}

export interface ProductSpecificationRef {
  id: string;
  href?: string;
  name?: string;
}

export interface ProdSpecCharValue {
  default?: boolean;
  value: string | number | boolean;
  valueType?: string;
  unitOfMeasure?: string;
}

export interface ProdSpecCharValueUse {
  name: string;
  description?: string;
  minCardinality?: number;
  maxCardinality?: number;
  productSpecCharacteristicValue: ProdSpecCharValue[];
  productSpecification?: ProductSpecificationRef;
}

export interface BundledProductOfferingOption {
  numberRelOfferLowerLimit?: number;
  numberRelOfferUpperLimit?: number;
  numberRelOfferDefault?: number;
}

export interface BundledProductOffering {
  id: string;
  href?: string;
  name?: string;
  bundledProductOfferingOption?: BundledProductOfferingOption;
}

export interface PriceTaxIncluded {
  taxIncludedAmount?: number;
  currencyCode?: string;
}

export interface ProductOfferPriceAlteration {
  name?: string;
  description?: string;
  validFor?: ValidFor;
  priceType?: ProductOfferingPrice['priceType'];
  unitOfMeasure?: string;
  price?: PriceTaxIncluded;
  recurringChargePeriod?: string;
  recurringChargeDayOfMonth?: number;
}

export interface ProductOfferingPrice {
  id?: string;
  name: string;
  description?: string;
  priceType?: 'recurring' | 'usage' | 'one time' | 'tariff';
  recurringChargePeriod?: string;
  recurringChargeDayOfMonth?: number;
  unitOfMeasure?: string;
  price?: PriceTaxIncluded;
  validFor?: ValidFor;
  pricingLogicAlgorithm?: { href?: string }[];
  productOfferPriceAlteration?: ProductOfferPriceAlteration;
  prodSpecCharValueUse?: ProdSpecCharValueUse[];
}

export interface ProductOffering {
  id: string;
  href?: string;
  name: string;
  description?: string;
  isBundle?: boolean;
  lifecycleStatus?: LifecycleStatus;
  validFor?: ValidFor;
  productSpecification?: ProductSpecificationRef;
  productOfferingPrice?: ProductOfferingPrice[];
  category?: { id: string; name: string }[];
  bundledProductOffering?: BundledProductOffering[];
  prodSpecCharValueUse?: ProdSpecCharValueUse[];
}

export interface Service {
  id: string;
  href?: string;
  state?: 'feasibilityChecked' | 'designed' | 'reserved' | 'inactive' | 'active' | 'terminated';
  isServiceEnabled?: boolean;
  serviceCharacteristic?: Characteristic[];
  serviceRelationship?: { type: string; service: { id: string } }[];
  relatedParty?: RelatedParty[];
  /**
   * SigScale flattens the product association on Service to a plain ID string
   * (or `productId` on older versions). Buckets are linked via this field —
   * not via the service ID.
   */
  product?: string;
  productId?: string;
}

/**
 * SigScale serializes status with both camelCase atoms (`pendingActive`) and
 * the human "Title Case" labels seen in legacy responses (`"Pending Active"`).
 * Accept both forms when parsing — when sending we always use the camelCase
 * variant defined by TMF.
 */
export type ProductStatus =
  | 'created'
  | 'pendingActive'
  | 'cancelled'
  | 'active'
  | 'pendingTerminate'
  | 'terminated'
  | 'suspended'
  | 'aborted'
  | 'Created'
  | 'Pending Active'
  | 'Cancelled'
  | 'Active'
  | 'Pending Terminate'
  | 'Terminated'
  | 'Suspended'
  | 'Aborted';

export interface ProductBalanceEntry {
  /** Aggregated remaining balance for one units family. */
  totalBalance?: Quantity;
}

export interface Product {
  id: string;
  href?: string;
  name?: string;
  status?: ProductStatus;
  startDate?: Iso8601;
  terminationDate?: Iso8601;
  productOffering?: { id: string; name?: string; href?: string };
  realizingService?: { id: string; href?: string }[];
  productCharacteristic?: Characteristic[];
  relatedParty?: RelatedParty[];
  /** Aggregated balances per unit type, exposed by SigScale's product list. */
  balance?: ProductBalanceEntry[];
}

export interface Bucket {
  id: string;
  href?: string;
  name?: string;
  /** Money paid for this bucket (top-up price). */
  price?: PriceTaxIncluded;
  /** Current remaining balance — initial amount is not exposed by the API. */
  remainedAmount?: Quantity;
  validFor?: { startDateTime?: Iso8601; endDateTime?: Iso8601 };
  product?: { id: string; href?: string };
  lifecycleStatus?: string;
}

export interface ResourceSpecificationRef {
  id: string;
  href?: string;
  name?: string;
}

export interface ResourceRelationship {
  relationshipType?: string;
  resource?: { id: string; href?: string; name?: string };
}

export interface Resource {
  id: string;
  href?: string;
  name?: string;
  description?: string;
  category?: string;
  resourceCharacteristic?: Characteristic[];
  resourceSpecification?: ResourceSpecificationRef;
  resourceRelationship?: ResourceRelationship[];
  lastModified?: Iso8601;
}

/**
 * TMF Resource specification IDs used by SigScale for tariff management.
 * Each "table" is a parent #resource (spec 1/5/7); each "row" is a child
 * #resource with a `resourceRelationship` back to its parent (spec 2/6/8).
 * The three spec-id pairs define the three tariff categories exposed in
 * the UI.
 */
export const TARIFF_SPEC = {
  rate:    { tableId: '1', rowId: '2', rowSpecName: 'TariffTableRow' },
  period:  { tableId: '5', rowId: '6', rowSpecName: 'PeriodTableRow' },
  roaming: { tableId: '7', rowId: '8', rowSpecName: 'RoamingTableRow' },
} as const;

export type TariffKind = keyof typeof TARIFF_SPEC;

export interface Client {
  id: string;
  identifier: string;
  port?: number;
  protocol?: 'RADIUS' | 'DIAMETER';
  secret?: string;
  trusted?: boolean;
  passwordRequired?: boolean;
}

export interface User {
  id: string;
  username: string;
  email?: string;
  language?: string;
  characteristic?: Characteristic[];
}

export interface UsageCharacteristic {
  name: string;
  value: string | number | boolean;
}

export interface Usage {
  id?: string;
  href?: string;
  date: Iso8601;
  type: 'AAAAccessUsage' | 'AAAAccountingUsage' | string;
  status?: string;
  description?: string;
  usageCharacteristic?: UsageCharacteristic[];
  usageSpecification?: { id: string; href?: string; name?: string };
  ratedProductUsage?: unknown[];
  relatedParty?: RelatedParty[];
}

/** Helper: pluck a named usageCharacteristic value as string. */
export function characteristic(usage: Usage, name: string): string | undefined {
  const found = usage.usageCharacteristic?.find((c) => c.name === name);
  return found ? String(found.value) : undefined;
}

/** Helper: pluck a named usageCharacteristic value as number. */
export function characteristicNumber(usage: Usage, name: string): number | undefined {
  const raw = characteristic(usage, name);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * HTTP access log record, as emitted by `ocs_rest_res_http:get_http/0`.
 * The backend parses Apache Common Log Format entries from the inets
 * `transfer_disk_log` — `datetime` arrives as `"DD/Mon/YYYY:HH:MM:SS +ZZZZ"`,
 * NOT ISO-8601, so formatters must accept that shape.
 */
export interface HttpEvent {
  datetime?: string;
  host?: string;
  user?: string;
  method?: string;
  uri?: string;
  httpStatus?: number;
}

/**
 * ABMF (Account Balance Management Function) log record.
 *
 * Shape per SigScale `ocs_rest_res_balance:abmf/1` codec. Consumed by the
 * `/logs/balance` view. Field names mirror the legacy `sig-balance-list.js`
 * expectations — upstream renamed `timeStamp` to `date` in commit c69e825b
 * (Nov 2024), so our type uses the new name.
 */
export interface AbmfEvent {
  date: Iso8601;
  /**
   * One of: `topup`, `adjustment`, `deduct`, `reserve`, `unreserve`,
   * `transfer`, `delete`. Other atoms may appear on newer deployments —
   * kept as a wide string for forward-compat.
   */
  type?: string;
  subscriber?: { id: string };
  /** The bucket whose balance was affected. */
  bucketBalance?: { id: string; href?: string };
  /** Delta applied by this event (signed on the backend side). */
  amount?: Quantity;
  /** Bucket's remain_amount immediately before the event. */
  amountBefore?: Quantity;
  /** Bucket's remain_amount immediately after the event. */
  amountAfter?: Quantity;
  product?: { id: string; href?: string };
}

export interface DashboardStats {
  subscriberCount?: number;
  activeSessions?: number;
  productCount?: number;
  bucketCount?: number;
  topupVolume24h?: number;
}
