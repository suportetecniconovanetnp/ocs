import { useI18n } from 'vue-i18n';

/**
 * Wrapper around useI18n's `t` that falls back to a capitalised key when the
 * translation is missing. Lets us reference legacy keys (subs, clients, etc.)
 * without breaking when an unrelated key is added later.
 */
export function useSafeT() {
  const { t, locale } = useI18n();
  function safeT(key: string, fallback?: string): string {
    const out = t(key);
    if (out !== key) return out;
    if (fallback) return fallback;
    return key.charAt(0).toUpperCase() + key.slice(1);
  }
  return { safeT, t, locale };
}
