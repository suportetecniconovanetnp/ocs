import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';
import { createVuetify, type ThemeDefinition } from 'vuetify';
import { aliases, mdi } from 'vuetify/iconsets/mdi';

const ocsLight: ThemeDefinition = {
  dark: false,
  colors: {
    primary: '#f57f17',
    'primary-darken-1': '#bc5100',
    secondary: '#aeea00',
    accent: '#ffb04c',
    background: '#fafafa',
    surface: '#ffffff',
    error: '#c62828',
    info: '#1976d2',
    success: '#2e7d32',
    warning: '#ed6c02',
  },
};

const ocsDark: ThemeDefinition = {
  dark: true,
  colors: {
    primary: '#ffb04c',
    'primary-darken-1': '#f57f17',
    secondary: '#aeea00',
    accent: '#bc5100',
    background: '#121212',
    surface: '#1e1e1e',
    error: '#ef5350',
    info: '#42a5f5',
    success: '#66bb6a',
    warning: '#ffa726',
  },
};

export const vuetify = createVuetify({
  theme: {
    defaultTheme: 'ocsLight',
    themes: { ocsLight, ocsDark },
  },
  icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
  defaults: {
    VBtn: { variant: 'flat' },
    VTextField: { variant: 'outlined', density: 'comfortable', hideDetails: 'auto' },
    VSelect: { variant: 'outlined', density: 'comfortable', hideDetails: 'auto' },
    VTextarea: { variant: 'outlined', density: 'comfortable', hideDetails: 'auto' },
    VCard: { rounded: 'lg' },
  },
});
