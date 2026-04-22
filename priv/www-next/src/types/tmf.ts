/**
 * Minimal TMF Forum / OCS API type surface.
 * Expand as service modules are migrated. Source of truth is the SigScale OCS
 * REST contracts (catalogManagement v2, serviceInventoryManagement v2,
 * productInventoryManagement v2, balanceManagement v1, resourceInventoryManagement v1).
 */

export type Iso8601 = string;
export type Money = { unit: string; value: number };

export interface Quantity {
  amount: number;
  units: string;
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

export interface ProductOffering {
  id: string;
  href?: string;
  name: string;
  description?: string;
  isBundle?: boolean;
  lifecycleStatus?: 'In Study' | 'In Design' | 'In Test' | 'Active' | 'Launched' | 'Retired';
  validFor?: { startDateTime?: Iso8601; endDateTime?: Iso8601 };
  productOfferingPrice?: ProductOfferingPrice[];
  category?: { id: string; name: string }[];
  bundledProductOffering?: { id: string; name?: string }[];
}

export interface ProductOfferingPrice {
  id?: string;
  name: string;
  description?: string;
  priceType?: 'recurring' | 'usage' | 'one time' | 'tariff';
  recurringChargePeriod?: string;
  unitOfMeasure?: Quantity;
  price?: Money;
  validFor?: { startDateTime?: Iso8601; endDateTime?: Iso8601 };
}

export interface Service {
  id: string;
  href?: string;
  state?: 'feasibilityChecked' | 'designed' | 'reserved' | 'inactive' | 'active' | 'terminated';
  isServiceEnabled?: boolean;
  serviceCharacteristic?: Characteristic[];
  serviceRelationship?: { type: string; service: { id: string } }[];
  relatedParty?: RelatedParty[];
}

export interface Product {
  id: string;
  href?: string;
  name?: string;
  status?: 'created' | 'pendingActive' | 'cancelled' | 'active' | 'pendingTerminate' | 'terminated' | 'suspended' | 'aborted';
  startDate?: Iso8601;
  terminationDate?: Iso8601;
  productOffering?: { id: string; name?: string };
  realizingService?: { id: string }[];
  productCharacteristic?: Characteristic[];
  relatedParty?: RelatedParty[];
}

export interface Bucket {
  id: string;
  href?: string;
  name?: string;
  amount?: Quantity;
  remainedAmount?: Quantity;
  validFor?: { startDateTime?: Iso8601; endDateTime?: Iso8601 };
  product?: { id: string };
}

export interface Resource {
  id: string;
  href?: string;
  name?: string;
  category?: string;
  resourceCharacteristic?: Characteristic[];
}

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

export interface DashboardStats {
  subscriberCount?: number;
  activeSessions?: number;
  productCount?: number;
  bucketCount?: number;
  topupVolume24h?: number;
}
