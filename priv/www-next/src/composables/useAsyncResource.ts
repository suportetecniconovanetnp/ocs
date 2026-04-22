import { ref, type Ref } from 'vue';
import { OcsApiError } from '@/services/http';
import { useNotificationsStore } from '@/stores/notifications';

export interface AsyncResource<T> {
  data: Ref<T | null>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  reload: () => Promise<void>;
}

/**
 * Lightweight wrapper around an async fetcher with loading/error state and a
 * single retry surface. For heavier needs (cache, dedupe, background revalidation)
 * we'll add TanStack Query in a later iteration — kept thin here to stay zero-dep
 * for the first migrated views.
 */
export function useAsyncResource<T>(fetcher: () => Promise<T>, autoload = true): AsyncResource<T> {
  const data = ref<T | null>(null) as Ref<T | null>;
  const loading = ref(false);
  const error = ref<string | null>(null);
  const notifications = useNotificationsStore();

  async function reload() {
    loading.value = true;
    error.value = null;
    try {
      data.value = await fetcher();
    } catch (e) {
      const message = e instanceof OcsApiError ? `${e.status}: ${e.message}` : (e as Error).message;
      error.value = message;
      notifications.error(message);
    } finally {
      loading.value = false;
    }
  }

  if (autoload) void reload();
  return { data, loading, error, reload };
}
