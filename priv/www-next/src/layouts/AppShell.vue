<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { usePreferencesStore } from '@/stores/preferences';
import { useAuthStore } from '@/stores/auth';
import { useSafeT } from '@/composables/useSafeT';
import { supportedLocales } from '@/plugins/i18n';
import HelpDialog from '@/components/HelpDialog.vue';

interface NavLink {
  to: string;
  titleKey: string;
  icon: string;
}

interface NavGroup {
  titleKey: string;
  icon: string;
  children: NavLink[];
}

const navItems: (NavLink | NavGroup)[] = [
  { to: '/', titleKey: 'dashboard', icon: 'mdi-view-dashboard' },
  { to: '/subscribers', titleKey: 'subs', icon: 'mdi-account-group' },
  { to: '/clients', titleKey: 'clients', icon: 'mdi-server-network' },
  {
    titleKey: 'catalog',
    icon: 'mdi-tag-multiple',
    children: [
      { to: '/catalog', titleKey: 'offerings', icon: 'mdi-tag-text' },
      { to: '/products', titleKey: 'products', icon: 'mdi-package-variant' },
      { to: '/buckets', titleKey: 'buckets', icon: 'mdi-wallet' },
    ],
  },
  {
    titleKey: 'tariffs',
    icon: 'mdi-cash-multiple',
    children: [
      { to: '/tariffs/rate', titleKey: 'tariffsRate', icon: 'mdi-cash' },
      { to: '/tariffs/period', titleKey: 'tariffsPeriod', icon: 'mdi-calendar-clock' },
      { to: '/tariffs/roaming', titleKey: 'tariffsRoaming', icon: 'mdi-earth' },
    ],
  },
  {
    titleKey: 'logs',
    icon: 'mdi-format-list-bulleted',
    children: [
      { to: '/logs/access', titleKey: 'access', icon: 'mdi-shield-key' },
      { to: '/logs/accounting', titleKey: 'accounting', icon: 'mdi-receipt-text' },
      { to: '/logs/balance', titleKey: 'balanceLog', icon: 'mdi-cash-register' },
      { to: '/logs/http', titleKey: 'httpLog', icon: 'mdi-web' },
      { to: '/logs/ipdr/wlan', titleKey: 'ipdrWlan', icon: 'mdi-wifi' },
      { to: '/logs/ipdr/voip', titleKey: 'ipdrVoip', icon: 'mdi-phone' },
    ],
  },
  {
    titleKey: 'administration',
    icon: 'mdi-cog',
    children: [
      { to: '/users', titleKey: 'users', icon: 'mdi-account-cog' },
      { to: '/policies', titleKey: 'policies', icon: 'mdi-script-text' },
    ],
  },
];

function isGroup(item: NavLink | NavGroup): item is NavGroup {
  return (item as NavGroup).children !== undefined;
}

const route = useRoute();
const router = useRouter();
const { safeT, t, locale } = useSafeT();
const prefs = usePreferencesStore();
const auth = useAuthStore();
const { drawerOpen, themeOverride } = storeToRefs(prefs);
const helpDialog = ref<InstanceType<typeof HelpDialog> | null>(null);

const currentTitle = computed(() => {
  const meta = route.meta as { titleKey?: string };
  return meta.titleKey ? safeT(meta.titleKey, '') : t('ocs');
});

function refresh() {
  router.go(0);
}

function disconnect() {
  auth.logout();
  router.replace({ name: 'login' });
}

function setLocale(code: string) {
  prefs.locale = code;
  locale.value = code;
}
</script>

<template>
  <v-app-bar color="primary" density="comfortable" elevation="2">
    <v-app-bar-nav-icon @click="drawerOpen = !drawerOpen" />
    <v-app-bar-title>
      <span class="text-subtitle-1 font-weight-medium">{{ safeT('ocs', 'OCS') }}</span>
      <span v-if="currentTitle" class="text-caption ml-3 opacity-80">{{ currentTitle }}</span>
    </v-app-bar-title>
    <v-spacer />
    <v-btn icon="mdi-refresh" :title="safeT('refresh', 'Refresh')" @click="refresh" />
    <v-btn icon="mdi-help-circle-outline" :title="safeT('help', 'Help')" @click="helpDialog?.show()" />
    <v-menu>
      <template #activator="{ props }">
        <v-btn icon="mdi-translate" v-bind="props" />
      </template>
      <v-list density="compact">
        <v-list-item
          v-for="loc in supportedLocales"
          :key="loc.code"
          :active="prefs.locale === loc.code"
          @click="setLocale(loc.code)"
        >
          <v-list-item-title>{{ loc.label }}</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-menu>
    <v-menu>
      <template #activator="{ props }">
        <v-btn icon="mdi-theme-light-dark" v-bind="props" />
      </template>
      <v-list density="compact">
        <v-list-item :active="themeOverride === 'auto'" @click="themeOverride = 'auto'">
          <v-list-item-title>Auto</v-list-item-title>
        </v-list-item>
        <v-list-item :active="themeOverride === 'light'" @click="themeOverride = 'light'">
          <v-list-item-title>Light</v-list-item-title>
        </v-list-item>
        <v-list-item :active="themeOverride === 'dark'" @click="themeOverride = 'dark'">
          <v-list-item-title>Dark</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-menu>
    <v-menu>
      <template #activator="{ props }">
        <v-btn icon v-bind="props">
          <v-icon icon="mdi-account-circle" />
        </v-btn>
      </template>
      <v-list density="compact" min-width="240">
        <v-list-item>
          <v-list-item-title class="font-weight-medium">{{ auth.username }}</v-list-item-title>
          <v-list-item-subtitle class="text-caption">{{ auth.baseUrl }}</v-list-item-subtitle>
        </v-list-item>
        <v-divider />
        <v-list-item prepend-icon="mdi-logout" @click="disconnect">
          <v-list-item-title>{{ safeT('disconnect', 'Disconnect') }}</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-menu>
  </v-app-bar>

  <v-navigation-drawer v-model="drawerOpen" width="280">
    <v-list density="comfortable" nav>
      <template v-for="(item, idx) in navItems" :key="idx">
        <v-list-item
          v-if="!isGroup(item)"
          :to="item.to"
          :prepend-icon="item.icon"
        >
          <v-list-item-title>{{ safeT(item.titleKey, '') }}</v-list-item-title>
        </v-list-item>
        <v-list-group v-else :value="item.titleKey">
          <template #activator="{ props }">
            <v-list-item v-bind="props" :prepend-icon="item.icon">
              <v-list-item-title>{{ safeT(item.titleKey, '') }}</v-list-item-title>
            </v-list-item>
          </template>
          <v-list-item
            v-for="child in item.children"
            :key="child.to"
            :to="child.to"
            :prepend-icon="child.icon"
          >
            <v-list-item-title>{{ safeT(child.titleKey, '') }}</v-list-item-title>
          </v-list-item>
        </v-list-group>
      </template>
    </v-list>
    <template #append>
      <div class="pa-3 text-caption text-medium-emphasis">
        SigScale OCS &middot; v0.1 (next)
      </div>
    </template>
  </v-navigation-drawer>

  <v-main>
    <v-container fluid class="pa-4">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </v-container>
  </v-main>

  <HelpDialog ref="helpDialog" />
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
