import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    component: () => import('@/layouts/AppShell.vue'),
    children: [
      {
        path: '',
        name: 'dashboard',
        component: () => import('@/views/DashboardView.vue'),
        meta: { titleKey: 'dashboard', icon: 'mdi-view-dashboard' },
      },
      {
        path: 'subscribers',
        name: 'subscribers',
        component: () => import('@/views/SubscribersView.vue'),
        meta: { titleKey: 'subs', icon: 'mdi-account-group' },
      },
      {
        path: 'clients',
        name: 'clients',
        component: () => import('@/views/ClientsView.vue'),
        meta: { titleKey: 'clients', icon: 'mdi-server-network' },
      },
      {
        path: 'users',
        name: 'users',
        component: () => import('@/views/UsersView.vue'),
        meta: { titleKey: 'users', icon: 'mdi-account-cog' },
      },
      {
        path: 'catalog',
        name: 'catalog',
        component: () => import('@/views/CatalogView.vue'),
        meta: { titleKey: 'catalog', icon: 'mdi-tag-multiple' },
      },
      {
        path: 'catalog/:id',
        name: 'offering-detail',
        component: () => import('@/views/OfferingDetailView.vue'),
        meta: { titleKey: 'catalog' },
      },
      {
        path: 'buckets',
        name: 'buckets',
        component: () => import('@/views/BucketsView.vue'),
        meta: { titleKey: 'buckets', icon: 'mdi-wallet' },
      },
      {
        path: 'products',
        name: 'products',
        component: () => import('@/views/ProductsView.vue'),
        meta: { titleKey: 'products', icon: 'mdi-package-variant' },
      },
      {
        path: 'logs/access',
        name: 'logs-access',
        component: () => import('@/views/LogsAccessView.vue'),
        meta: { titleKey: 'access', icon: 'mdi-shield-key' },
      },
      {
        path: 'logs/accounting',
        name: 'logs-accounting',
        component: () => import('@/views/LogsAccountingView.vue'),
        meta: { titleKey: 'accounting', icon: 'mdi-receipt-text' },
      },
      {
        path: 'logs/balance',
        name: 'logs-balance',
        component: () => import('@/views/LogsAbmfView.vue'),
        meta: { titleKey: 'balanceLog', icon: 'mdi-cash-register' },
      },
      {
        path: 'logs/http',
        name: 'logs-http',
        component: () => import('@/views/LogsHttpView.vue'),
        meta: { titleKey: 'httpLog', icon: 'mdi-web' },
      },
      {
        path: 'tariffs/rate',
        name: 'tariffs-rate',
        component: () => import('@/views/TariffRateView.vue'),
        meta: { titleKey: 'tariffsRate', icon: 'mdi-cash-multiple' },
      },
      {
        path: 'tariffs/period',
        name: 'tariffs-period',
        component: () => import('@/views/TariffPeriodView.vue'),
        meta: { titleKey: 'tariffsPeriod', icon: 'mdi-calendar-clock' },
      },
      {
        path: 'tariffs/roaming',
        name: 'tariffs-roaming',
        component: () => import('@/views/PlaceholderView.vue'),
        props: { title: 'Roaming tariffs', legacyFile: 'sig-tariff-roaming-list.js' },
        meta: { titleKey: 'tariffsRoaming', icon: 'mdi-earth' },
      },
      {
        path: 'policies',
        name: 'policies',
        component: () => import('@/views/PlaceholderView.vue'),
        props: { title: 'Policies', legacyFile: 'sig-policy-list.js' },
        meta: { titleKey: 'policies', icon: 'mdi-script-text' },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.public) return true;
  if (!auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  return true;
});
