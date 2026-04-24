import type { Characteristic, Service, Quantity } from '@/types/tmf';
import { parseDuration, formatDuration } from '@/composables/useDuration';

/* ------------------------------------------------------------------ *
 * Form shapes
 * ------------------------------------------------------------------ */

export type BalanceUnit = 'cents' | 'octets' | 'seconds';

/**
 * SigScale's legacy lifecycle labels (UI) versus the state atom sent on
 * the TMF service payload. The 6 Polymer statuses map 1:1 as follows.
 */
export const LIFECYCLE_STATES = [
  { label: 'Feasibility Checked', state: 'feasibilityChecked' },
  { label: 'Designed', state: 'designed' },
  { label: 'Reserved', state: 'reserved' },
  { label: 'Active', state: 'active' },
  { label: 'Inactive', state: 'inactive' },
  { label: 'Terminated', state: 'terminated' },
] as const;

export interface SubscriberFormProduct {
  /** Picked from the "Product Offering" dropdown (new product will be created). */
  offeringId: string;
  /** Typed directly when reusing an existing product (skips product creation). */
  existingProductId: string;
  lifecycleLabel: string;
  startDate: string;
  endDate: string;
}

export interface SubscriberFormAuth {
  identity: string;
  password: string;
  generateIdentity: boolean;
  generatePassword: boolean;
  akaK: string;
  akaOpc: string;
}

export interface SubscriberFormAuthz {
  /** Human duration like "30m", "2h", "1d". */
  sessionInterval: string;
  sessionTimeout: string;
  className: string;
  enabled: boolean;
  multisession: boolean;
}

export interface SubscriberFormCredit {
  /** Raw user input — "500", "1g", "2m", "30s". */
  amount: string;
  units: BalanceUnit;
  /** Optional bucket validity (datetime-local strings, "" for unset). */
  validFrom: string;
  validTo: string;
}

export interface SubscriberForm {
  product: SubscriberFormProduct;
  auth: SubscriberFormAuth;
  authz: SubscriberFormAuthz;
  credit: SubscriberFormCredit;
}

/* ------------------------------------------------------------------ *
 * Defaults
 * ------------------------------------------------------------------ */

export function emptySubscriberForm(): SubscriberForm {
  return {
    product: {
      offeringId: '',
      existingProductId: '',
      lifecycleLabel: 'Active',
      startDate: '',
      endDate: '',
    },
    auth: {
      identity: '',
      password: '',
      generateIdentity: false,
      generatePassword: false,
      akaK: '',
      akaOpc: '',
    },
    authz: {
      sessionInterval: '',
      sessionTimeout: '',
      className: '',
      enabled: true,
      multisession: false,
    },
    credit: {
      amount: '',
      units: 'cents',
      validFrom: '',
      validTo: '',
    },
  };
}

/**
 * Convert the form's local datetime strings into the optional `validFor`
 * payload accepted by `balanceApi.topup`/`adjustment`.
 *
 * IMPORTANT: SigScale's `ocs_rest:iso8601/1` parser is wall-clock and
 * does NOT accept the `Z` UTC designator (it tokenises on `:`/`.` and
 * feeds each piece to `list_to_integer/1`, so `"...000Z"` blows up with
 * `badarg`, surfaced as `400 "Exception occurred parsing request body"`).
 * The legacy Polymer UI worked because it sent the raw `YYYY-MM-DDTHH:MM`
 * string from `<input type="datetime-local">`. We do the same here.
 *
 * Returns undefined when neither field is set, matching the
 * "no validity = unlimited" backend default.
 */
export function buildCreditValidFor(
  credit: SubscriberFormCredit,
): { startDateTime?: string; endDateTime?: string } | undefined {
  const start = sanitizeBackendDate(credit.validFrom);
  const end = sanitizeBackendDate(credit.validTo);
  if (!start && !end) return undefined;
  return {
    ...(start && { startDateTime: start }),
    ...(end && { endDateTime: end }),
  };
}

function sanitizeBackendDate(local: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return undefined;
  return local.endsWith('Z') ? local.slice(0, -1) : local;
}

/* ------------------------------------------------------------------ *
 * Build the `Service` POST/PATCH payload
 * ------------------------------------------------------------------ */

function lifecycleToState(label: string): Service['state'] | undefined {
  const match = LIFECYCLE_STATES.find((e) => e.label === label);
  return match?.state as Service['state'] | undefined;
}

export function buildServicePayload(
  form: SubscriberForm,
  mode: 'create' | 'update',
): Partial<Service> & { product?: string; startDate?: string; endDate?: string } {
  const chars: Characteristic[] = [];
  if (!form.auth.generateIdentity && form.auth.identity) {
    chars.push({ name: 'serviceIdentity', value: form.auth.identity });
  }
  if (!form.auth.generatePassword && form.auth.password) {
    chars.push({ name: 'servicePassword', value: form.auth.password });
  }
  if (form.auth.akaK) {
    chars.push({ name: 'serviceAkaK', value: form.auth.akaK });
  }
  if (form.auth.akaOpc) {
    chars.push({ name: 'serviceAkaOPc', value: form.auth.akaOpc });
  }
  const interval = parseDuration(form.authz.sessionInterval);
  if (interval !== undefined) {
    chars.push({ name: 'acctSessionInterval', value: interval });
  }
  const timeout = parseDuration(form.authz.sessionTimeout);
  if (timeout !== undefined) {
    chars.push({ name: 'sessionTimeout', value: timeout });
  }
  if (form.authz.multisession) {
    chars.push({ name: 'multisession', value: true, valueType: 'boolean' });
  }
  if (form.authz.className) {
    chars.push({ name: 'class', value: form.authz.className });
  }

  const payload: Partial<Service> & {
    product?: string;
    startDate?: string;
    endDate?: string;
  } = {
    serviceCharacteristic: chars,
    isServiceEnabled: form.authz.enabled,
  };
  const state = lifecycleToState(form.product.lifecycleLabel);
  if (state) payload.state = state;
  if (form.product.startDate) payload.startDate = form.product.startDate;
  if (form.product.endDate) payload.endDate = form.product.endDate;

  // Attach an existing product directly to the service (skips product creation).
  if (mode === 'create' && form.product.existingProductId) {
    payload.product = form.product.existingProductId;
  }

  if (mode === 'create') {
    // Legacy always sets serviceSpecification id=1 for new services.
    (payload as Record<string, unknown>).serviceSpecification = {
      id: '1',
      href: '/catalogManagement/v2/serviceSpecification/1',
    };
    // ID server-generated when user picked "Generate identity".
    if (!form.auth.generateIdentity && form.auth.identity) {
      (payload as Record<string, unknown>).id = form.auth.identity;
    }
  }

  return payload;
}

/* ------------------------------------------------------------------ *
 * Build the Product (POST /productInventoryManagement/v2/product) and
 * the Balance Adjustment (POST /balanceManagement/v1/balanceAdjustment)
 * bodies that follow a successful service POST.
 * ------------------------------------------------------------------ */

export interface ProductPayload {
  productOffering: { id: string; name: string; href: string };
  realizingService: { id: string; href: string }[];
}

export function buildProductPayload(offeringId: string, serviceId: string): ProductPayload {
  return {
    productOffering: {
      id: offeringId,
      name: offeringId,
      href: `/catalogManagement/v2/productOffering/${encodeURIComponent(offeringId)}`,
    },
    realizingService: [
      {
        id: serviceId,
        href: `/serviceInventoryManagement/v2/service/${encodeURIComponent(serviceId)}`,
      },
    ],
  };
}

/**
 * Encode the user-entered amount into the SigScale unit-of-measure string:
 *   octets  → "1500b", "5m"→"5000000b", "1g"→"1000000000b"
 *   seconds → "60s",   "5m"→"300s",    "1h"→"3600s"
 *   cents   → raw number as-is
 * Returns undefined when amount is empty or unparseable.
 */
export function buildCreditQuantity(
  amount: string,
  units: BalanceUnit,
): Quantity | undefined {
  if (!amount) return undefined;
  const trimmed = amount.trim();
  const last = trimmed.charAt(trimmed.length - 1).toLowerCase();
  const hasSuffix = Number.isNaN(parseInt(last, 10));
  const numericPart = hasSuffix ? trimmed.slice(0, -1) : trimmed;
  const value = Number(numericPart);
  if (!Number.isFinite(value)) return undefined;

  if (units === 'cents') {
    return { units, amount: value };
  }
  if (units === 'octets') {
    let out: number;
    if (last === 'k') out = value * 1_000;
    else if (last === 'm') out = value * 1_000_000;
    else if (last === 'g') out = value * 1_000_000_000;
    else out = value;
    return { units, amount: `${out}b` };
  }
  // seconds
  let out: number;
  if (last === 'm') out = value * 60;
  else if (last === 'h') out = value * 3_600;
  else if (last === 'd') out = value * 86_400;
  else out = value;
  return { units, amount: `${out}s` };
}

/* ------------------------------------------------------------------ *
 * Parse an existing Service back to the form shape (for edit mode)
 * ------------------------------------------------------------------ */

function lookup(chars: Characteristic[] | undefined, name: string): unknown {
  return chars?.find((c) => c.name === name)?.value;
}

function stateToLabel(state: Service['state'] | undefined): string {
  const match = LIFECYCLE_STATES.find((e) => e.state === state);
  return match?.label ?? 'Active';
}

export function parseSubscriber(svc: Service): SubscriberForm {
  const chars = svc.serviceCharacteristic;
  const intervalRaw = lookup(chars, 'acctSessionInterval');
  const timeoutRaw = lookup(chars, 'sessionTimeout');
  return {
    product: {
      offeringId: '',
      existingProductId: svc.product ?? svc.productId ?? '',
      lifecycleLabel: stateToLabel(svc.state),
      startDate: '',
      endDate: '',
    },
    auth: {
      identity: String(lookup(chars, 'serviceIdentity') ?? svc.id ?? ''),
      password: String(lookup(chars, 'servicePassword') ?? ''),
      generateIdentity: false,
      generatePassword: false,
      akaK: String(lookup(chars, 'serviceAkaK') ?? ''),
      akaOpc: String(lookup(chars, 'serviceAkaOPc') ?? ''),
    },
    authz: {
      sessionInterval: typeof intervalRaw === 'number' ? formatDuration(intervalRaw) : '',
      sessionTimeout: typeof timeoutRaw === 'number' ? formatDuration(timeoutRaw) : '',
      className: String(lookup(chars, 'class') ?? ''),
      enabled: svc.isServiceEnabled ?? true,
      multisession: Boolean(lookup(chars, 'multisession')),
    },
    credit: {
      amount: '',
      units: 'cents',
      validFrom: '',
      validTo: '',
    },
  };
}
