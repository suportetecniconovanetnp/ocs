import { useI18n } from 'vue-i18n';

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;
const SECONDS_UNITS: { unit: number; label: string }[] = [
  { unit: 86_400, label: 'd' },
  { unit: 3_600, label: 'h' },
  { unit: 60, label: 'm' },
  { unit: 1, label: 's' },
];

export function useFormatters() {
  const { locale } = useI18n();

  function date(input: string | number | Date | undefined | null): string {
    if (input == null || input === '') return '—';
    const d = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(d.getTime())) return String(input);
    return d.toLocaleString(locale.value);
  }

  function dateOnly(input: string | number | Date | undefined | null): string {
    if (input == null || input === '') return '—';
    const d = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(d.getTime())) return String(input);
    return d.toLocaleDateString(locale.value);
  }

  function bytes(value: number | undefined | null, fractionDigits = 2): string {
    if (value == null || !Number.isFinite(value)) return '—';
    if (value === 0) return '0 B';
    const exp = Math.min(Math.floor(Math.log(Math.abs(value)) / Math.log(1024)), BYTE_UNITS.length - 1);
    const num = value / Math.pow(1024, exp);
    return `${num.toFixed(fractionDigits)} ${BYTE_UNITS[exp]}`;
  }

  function duration(seconds: number | undefined | null): string {
    if (seconds == null || !Number.isFinite(seconds)) return '—';
    if (seconds < 1) return '0s';
    let remaining = Math.floor(seconds);
    const parts: string[] = [];
    for (const { unit, label } of SECONDS_UNITS) {
      if (remaining >= unit) {
        const value = Math.floor(remaining / unit);
        parts.push(`${value}${label}`);
        remaining -= value * unit;
        if (parts.length === 2) break;
      }
    }
    return parts.length ? parts.join(' ') : '0s';
  }

  function money(amount: number | undefined | null, currency = 'USD'): string {
    if (amount == null || !Number.isFinite(amount)) return '—';
    return new Intl.NumberFormat(locale.value, { style: 'currency', currency }).format(amount);
  }

  function number(value: number | undefined | null): string {
    if (value == null || !Number.isFinite(value)) return '—';
    return new Intl.NumberFormat(locale.value).format(value);
  }

  return { date, dateOnly, bytes, duration, money, number };
}
