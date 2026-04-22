import { defineStore } from 'pinia';
import { ref } from 'vue';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
  timeout?: number;
}

let nextId = 1;

export const useNotificationsStore = defineStore('notifications', () => {
  const toasts = ref<Toast[]>([]);

  function push(toast: Omit<Toast, 'id'>): number {
    const id = nextId++;
    toasts.value.push({ id, timeout: 4000, ...toast });
    return id;
  }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  return {
    toasts,
    push,
    dismiss,
    info: (text: string) => push({ kind: 'info', text }),
    success: (text: string) => push({ kind: 'success', text }),
    warning: (text: string) => push({ kind: 'warning', text }),
    error: (text: string) => push({ kind: 'error', text, timeout: 8000 }),
  };
});
