import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // Mock `server-only` so pure-logic imports from server modules
      // (e.g. actions.ts) can be tested in Vitest without the Next.js
      // server boundary guard throwing a build-time error.
      'server-only': path.resolve(__dirname, '__mocks__/server-only.ts'),
      // Mock framer-motion so animated components render as plain HTML
      // elements in jsdom, avoiding layout-effect and GSAP warnings.
      'framer-motion': path.resolve(__dirname, '__mocks__/framer-motion.tsx'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
