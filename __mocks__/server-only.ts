// Mock for the `server-only` package used in Next.js server modules.
// In the real Next.js build, this package throws if imported from a client
// bundle. In Vitest (which has no server/client boundary), we replace it
// with a no-op so pure-logic functions exported from server modules can be
// imported and tested directly.
export {};
