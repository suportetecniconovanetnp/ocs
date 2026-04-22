import { createI18n } from 'vue-i18n';
import en from '../../locales/en.json';
import es from '../../locales/es.json';

/**
 * Existing OCS locale files use `{ key: { description, message } }`.
 * Flatten to `{ key: message }` so vue-i18n templates stay simple.
 * This keeps the JSON files compatible with the legacy Polymer UI during
 * the strangler-fig migration — no churn on translation tooling.
 */
type LegacyEntry = { description?: string; message: string };
type LegacyDict = Record<string, LegacyEntry | string>;

function flatten(dict: LegacyDict): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(dict)) {
    out[key] = typeof value === 'string' ? value : value.message;
  }
  return out;
}

const defaultLocale = import.meta.env.VITE_OCS_DEFAULT_LOCALE ?? 'en';

/**
 * Keys introduced by the modernised UI that don't exist in the legacy
 * Polymer locale files. Kept here so we don't have to fork those JSONs.
 */
const extraMessages: Record<string, Record<string, string>> = {
  en: {
    dashboard: 'Dashboard',
    refresh: 'Refresh',
    catalog: 'Catalog',
    buckets: 'Buckets',
    sessions: 'Recent sessions',
    traffic: 'Accounting traffic — last 50 records',
    add: 'Add',
    search: 'Search',
    disconnect: 'Disconnect',
    users: 'Users',
    tariffsRate: 'Rate tariffs',
    tariffsPeriod: 'Period tariffs',
    tariffsRoaming: 'Roaming tariffs',
    policies: 'Policies',
    help: 'Help',
    administration: 'Administration',
    tariffs: 'Tariffs',
    offerings: 'Offerings',
  },
  es: {
    dashboard: 'Panel',
    refresh: 'Actualizar',
    catalog: 'Catálogo',
    buckets: 'Bolsas',
    sessions: 'Sesiones recientes',
    traffic: 'Tráfico de accounting — últimos 50 registros',
    add: 'Agregar',
    search: 'Buscar',
    disconnect: 'Desconectar',
    users: 'Usuarios',
    tariffsRate: 'Tarifas',
    tariffsPeriod: 'Períodos',
    tariffsRoaming: 'Roaming',
    policies: 'Políticas',
    help: 'Ayuda',
    administration: 'Administración',
    tariffs: 'Tarifas',
    offerings: 'Ofertas',
  },
};

export const i18n = createI18n({
  legacy: false,
  locale: defaultLocale,
  fallbackLocale: 'en',
  missingWarn: false,
  fallbackWarn: false,
  messages: {
    en: { ...flatten(en as LegacyDict), ...extraMessages.en },
    es: { ...flatten(es as LegacyDict), ...extraMessages.es },
  },
});

export const supportedLocales = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
] as const;
