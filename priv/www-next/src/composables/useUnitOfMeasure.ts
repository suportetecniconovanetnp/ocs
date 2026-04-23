/**
 * Helpers for OCS unit-of-measure strings used by ProductOfferingPrice.
 * Conventions match the legacy sig-offer-add.js logic:
 *
 * - Bytes:      "1500b", "10000b", "5000000b" (always raw bytes with `b` suffix)
 *               Inputs accept "1500", "10k", "5m", "1g" → 1500 / 10000 / 5000000 / 1000000000.
 * - Seconds:    "60s", "3600s" (always raw seconds with `s` suffix)
 *               Inputs accept "30", "1m", "1h" → 30 / 60 / 3600.
 * - Messages:   "10msg" (raw count with `msg` suffix).
 * - Cents:      stored as numeric; no UoM string.
 *
 * `unit` distinguishes the dimension. `size` is the human-friendly entry.
 */

export type PriceUnit = 'b' | 's' | 'msg' | 'cents';

export function buildUnitOfMeasure(unit: PriceUnit, size: string): string | undefined {
  if (!size) return undefined;
  const trimmed = size.trim();
  const lastChar = trimmed.charAt(trimmed.length - 1).toLowerCase();
  const hasSuffix = Number.isNaN(parseInt(lastChar, 10));
  const numericPart = hasSuffix ? trimmed.slice(0, -1) : trimmed;
  const value = Number(numericPart);
  if (!Number.isFinite(value)) return undefined;

  if (unit === 'b') {
    if (lastChar === 'k') return `${value * 1_000}b`;
    if (lastChar === 'm') return `${value * 1_000_000}b`;
    if (lastChar === 'g') return `${value * 1_000_000_000}b`;
    return `${value}b`;
  }
  if (unit === 's') {
    if (lastChar === 'm') return `${value * 60}s`;
    if (lastChar === 'h') return `${value * 3_600}s`;
    if (lastChar === 'd') return `${value * 86_400}s`;
    return `${value}s`;
  }
  if (unit === 'msg') {
    return `${value}msg`;
  }
  return undefined;
}

/**
 * Parse a stored unit-of-measure back into its inferred unit and human size.
 * "60s" → { unit: "s", size: "1m" }, "5000000b" → { unit: "b", size: "5m" }.
 */
export function parseUnitOfMeasure(uom: string | undefined | null): {
  unit: PriceUnit;
  size: string;
} {
  if (!uom) return { unit: 'cents', size: '' };
  const lower = uom.toLowerCase();
  if (lower.endsWith('msg')) {
    return { unit: 'msg', size: lower.slice(0, -3) };
  }
  if (lower.endsWith('b')) {
    const raw = Number(lower.slice(0, -1));
    if (!Number.isFinite(raw)) return { unit: 'b', size: lower.slice(0, -1) };
    if (raw % 1_000_000_000 === 0) return { unit: 'b', size: `${raw / 1_000_000_000}g` };
    if (raw % 1_000_000 === 0) return { unit: 'b', size: `${raw / 1_000_000}m` };
    if (raw % 1_000 === 0) return { unit: 'b', size: `${raw / 1_000}k` };
    return { unit: 'b', size: String(raw) };
  }
  if (lower.endsWith('s')) {
    const raw = Number(lower.slice(0, -1));
    if (!Number.isFinite(raw)) return { unit: 's', size: lower.slice(0, -1) };
    if (raw % 86_400 === 0) return { unit: 's', size: `${raw / 86_400}d` };
    if (raw % 3_600 === 0) return { unit: 's', size: `${raw / 3_600}h` };
    if (raw % 60 === 0) return { unit: 's', size: `${raw / 60}m` };
    return { unit: 's', size: String(raw) };
  }
  return { unit: 'cents', size: uom };
}
