import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

const BASE_URL_KEY = 'ocs.baseUrl';
const CREDS_KEY = 'ocs.creds';

interface StoredCreds {
  username: string;
  password: string;
}

function readBaseUrl(): string {
  return localStorage.getItem(BASE_URL_KEY) ?? '';
}

function readCreds(): StoredCreds | null {
  const raw = sessionStorage.getItem(CREDS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredCreds;
  } catch {
    return null;
  }
}

export const useAuthStore = defineStore('auth', () => {
  const baseUrl = ref<string>(readBaseUrl());
  const username = ref<string>(readCreds()?.username ?? '');
  const password = ref<string>(readCreds()?.password ?? '');

  const isAuthenticated = computed(() => Boolean(username.value && password.value));
  const authHeader = computed(() =>
    isAuthenticated.value ? `Basic ${btoa(`${username.value}:${password.value}`)}` : '',
  );

  function setBaseUrl(url: string) {
    baseUrl.value = url.replace(/\/+$/, '');
    if (baseUrl.value) localStorage.setItem(BASE_URL_KEY, baseUrl.value);
    else localStorage.removeItem(BASE_URL_KEY);
  }

  function setCredentials(user: string, pass: string) {
    username.value = user;
    password.value = pass;
    sessionStorage.setItem(CREDS_KEY, JSON.stringify({ username: user, password: pass }));
  }

  function logout() {
    username.value = '';
    password.value = '';
    sessionStorage.removeItem(CREDS_KEY);
  }

  return {
    baseUrl,
    username,
    password,
    isAuthenticated,
    authHeader,
    setBaseUrl,
    setCredentials,
    logout,
  };
});
