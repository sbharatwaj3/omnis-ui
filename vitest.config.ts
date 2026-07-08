import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // IMPORTANT: Specific path aliases must appear BEFORE the catch-all '@'
      // alias. Vite/Vitest processes aliases in order and stops at the first
      // match — if '@' is listed first it would consume '@/utils/supabase/...'
      // imports before the more specific aliases below can intercept them.

      // Mock `server-only` so pure-logic imports from server modules
      // (e.g. actions.ts) can be tested in Vitest without the Next.js
      // server boundary guard throwing a build-time error.
      { find: 'server-only', replacement: path.resolve(__dirname, '__mocks__/server-only.ts') },
      // Mock framer-motion so animated components render as plain HTML
      // elements in jsdom, avoiding layout-effect and GSAP warnings.
      { find: 'framer-motion', replacement: path.resolve(__dirname, '__mocks__/framer-motion.tsx') },
      // Mock the Supabase admin client (service-role) so Server Action
      // property tests never make live DB calls. Individual tests configure
      // return values via vi.mocked(adminClient.from).mockReturnValue(...).
      { find: '@/utils/supabase/admin', replacement: path.resolve(__dirname, '__mocks__/supabase-admin.ts') },
      // Mock the Supabase server client (cookie-based session) so Server
      // Actions that call createClient() can be tested without Next.js
      // cookie infrastructure being available in jsdom.
      { find: '@/utils/supabase/server', replacement: path.resolve(__dirname, '__mocks__/supabase-server.ts') },
      // Catch-all '@' alias — must come last so specific overrides above take precedence.
      { find: '@', replacement: path.resolve(__dirname, '.') },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['__tests__/setup.ts'],
  },
});
