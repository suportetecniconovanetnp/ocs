import { defineStore } from 'pinia';
import { useLocalStorage, usePreferredDark } from '@vueuse/core';
import { computed } from 'vue';

export const usePreferencesStore = defineStore('preferences', () => {
  const prefersDark = usePreferredDark();
  const themeOverride = useLocalStorage<'light' | 'dark' | 'auto'>('ocs.theme', 'auto');
  const locale = useLocalStorage<string>('ocs.locale', 'en');
  const drawerOpen = useLocalStorage<boolean>('ocs.drawer', true);

  const effectiveTheme = computed<'ocsLight' | 'ocsDark'>(() => {
    if (themeOverride.value === 'dark') return 'ocsDark';
    if (themeOverride.value === 'light') return 'ocsLight';
    return prefersDark.value ? 'ocsDark' : 'ocsLight';
  });

  return { themeOverride, locale, drawerOpen, effectiveTheme };
});
