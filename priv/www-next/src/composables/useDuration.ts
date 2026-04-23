/**
 * Parse a SigScale-style duration like "30m", "2h", "1d", or "120" (seconds).
 * Returns total seconds, or undefined for invalid input.
 */
export function parseDuration(input: string | number | undefined | null): number | undefined {
  if (input == null || input === '') return undefined;
  if (typeof input === 'number') return Math.floor(input);
  const trimmed = input.trim();
  const match = /^(\d+)\s*([smhd])?$/i.exec(trimmed);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return undefined;
  const unit = (match[2] ?? 's').toLowerCase();
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86_400 };
  return value * (multipliers[unit] ?? 1);
}

/**
 * Inverse of parseDuration: turn seconds back into the most natural unit.
 * 86400 → "1d", 3600 → "1h", 60 → "1m", anything else → "<n>s".
 */
export function formatDuration(seconds: number | undefined | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds === 0) return '';
  if (seconds % 86_400 === 0) return `${seconds / 86_400}d`;
  if (seconds % 3_600 === 0) return `${seconds / 3_600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}
