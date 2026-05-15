import { defineConfig, loadEnv, type PluginOption } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { fileURLToPath, URL } from 'node:url';

/**
 * Per-request proxy: the browser sends `X-OCS-Target: http://host:port`
 * with each request hitting `/__ocs/*`, and Vite forwards it. Lets the
 * login screen point to any backend without forcing CORS server-side.
 */
function dynamicOcsProxy(defaultTarget: string): PluginOption {
  return {
    name: 'ocs-dynamic-proxy',
    configureServer(server) {
      const proxy = createProxyMiddleware({
        target: defaultTarget,
        changeOrigin: true,
        router: (req) => {
          const header = req.headers['x-ocs-target'];
          const target = Array.isArray(header) ? header[0] : header;
          return typeof target === 'string' && target.length > 0 ? target : defaultTarget;
        },
        pathRewrite: { '^/__ocs': '' },
        logger: console,
      });
      server.middlewares.use('/__ocs', proxy);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_OCS_API_URL ?? 'http://localhost:8080';

  return {
    plugins: [
      vue(),
      vuetify({ autoImport: true }),
      dynamicOcsProxy(apiTarget),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
    },
    build: {
      outDir: 'dist',
      sourcemap: mode !== 'production',
      target: 'es2022',
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['vue', 'vue-router', 'pinia'],
            vuetify: ['vuetify'],
            charts: ['echarts', 'vue-echarts'],
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      include: ['tests/unit/**/*.test.ts'],
      setupFiles: ['tests/unit/setup.ts'],
      exclude: ['tests/e2e/**'],
    },
  };
});
