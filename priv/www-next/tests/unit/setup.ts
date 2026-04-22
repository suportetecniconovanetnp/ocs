import { config } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach } from 'vitest';

beforeEach(() => {
  setActivePinia(createPinia());
});

config.global.mocks = {
  $t: (key: string) => key,
};
