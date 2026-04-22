<script setup lang="ts">
import { computed, watch } from 'vue';
import { useTheme } from 'vuetify';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { usePreferencesStore } from '@/stores/preferences';
import { useNotificationsStore } from '@/stores/notifications';

const theme = useTheme();
const prefs = usePreferencesStore();
const notifications = useNotificationsStore();
const { toasts } = storeToRefs(notifications);
const { locale } = useI18n();

const activeTheme = computed(() => prefs.effectiveTheme);

watch(
  activeTheme,
  (next) => {
    theme.change(next);
  },
  { immediate: true },
);

watch(
  () => prefs.locale,
  (next) => {
    locale.value = next;
  },
  { immediate: true },
);
</script>

<template>
  <v-app>
    <router-view />
    <v-snackbar
      v-for="toast in toasts"
      :key="toast.id"
      :model-value="true"
      :color="toast.kind"
      :timeout="toast.timeout"
      location="bottom right"
      @update:model-value="notifications.dismiss(toast.id)"
    >
      {{ toast.text }}
    </v-snackbar>
  </v-app>
</template>
