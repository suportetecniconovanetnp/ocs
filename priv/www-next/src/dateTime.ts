const UTC_NAIVE_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2})(?::(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?)?$/;

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/**
 * Parse backend date strings as UTC when they omit an explicit timezone.
 * SigScale's REST helpers emit `YYYY-MM-DDTHH:MM:SS(.mmm)` without `Z`,
 * but the epoch values they derive from are UTC-based.
 */
export function parseBackendDate(
  input: string | number | Date | undefined | null,
): Date | undefined {
  if (input == null || input === '') return undefined;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? undefined : input;
  if (typeof input === 'number') {
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  const value = input.trim();
  if (!value) return undefined;

  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  const match = value.match(UTC_NAIVE_RE);
  if (match) {
    const [, y, mo, d, h = '00', mi = '00', s = '00', ms = '0'] = match;
    const date = new Date(
      Date.UTC(
        Number(y),
        Number(mo) - 1,
        Number(d),
        Number(h),
        Number(mi),
        Number(s),
        Number(ms.padEnd(3, '0')),
      ),
    );
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Convert a browser-local `datetime-local` value into the backend's expected
 * UTC timestamp representation, but without a trailing `Z`.
 */
export function localInputToBackendDate(localInput: string): string | undefined {
  if (!localInput) return undefined;
  const d = new Date(localInput);
  if (Number.isNaN(d.getTime())) return undefined;
  return [
    pad(d.getUTCFullYear(), 4),
    '-',
    pad(d.getUTCMonth() + 1),
    '-',
    pad(d.getUTCDate()),
    'T',
    pad(d.getUTCHours()),
    ':',
    pad(d.getUTCMinutes()),
  ].join('');
}

/**
 * Format a backend UTC timestamp for a local browser `datetime-local` input.
 */
export function backendDateToLocalInput(
  input: string | number | Date | undefined | null,
): string {
  const d = parseBackendDate(input);
  if (!d) return '';
  return [
    pad(d.getFullYear(), 4),
    '-',
    pad(d.getMonth() + 1),
    '-',
    pad(d.getDate()),
    'T',
    pad(d.getHours()),
    ':',
    pad(d.getMinutes()),
  ].join('');
}
