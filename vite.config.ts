import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
        faq: resolve(__dirname, 'faq.html'),
      },
    },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
