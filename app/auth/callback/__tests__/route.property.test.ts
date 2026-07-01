// Feature: oauth-social-login, Property 3: Callback route routing is determined exclusively by org_id
// Feature: oauth-social-login, Property 4: Email-confirmation flow is preserved for all type signals
// (This file contains Property 3 tests from Task 4.2 and Property 4 tests from Task 4.3)

import * as fc from 'fast-check';
import { GET } from '../route';

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: () => [],
    set: vi.fn(),
  }),
}));

let mockExchangeError: null | { message: string } = null;
let mockUser: { id: string } | null = { id: 'test-user-id' };
let mockUserError: null | { message: string } = null;
let mockOrgId: string | null = null;
const mockFrom = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      exchangeCodeForSession: vi.fn(async () => ({ error: mockExchangeError })),
      getUser: vi.fn(async () => ({
        data: { user: mockUser },
        error: mockUserError,
      })),
    },
    from: mockFrom,
  })),
}));

function makeRequest(params: Record<string, string> = {}): Request {
  const url = new URL('https://example.com/auth/callback');
  url.searchParams.set('code', 'test-code');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Request(url.toString());
}

function getRedirectUrl(response: Response): string {
  return response.headers.get('location') ?? '';
}

beforeEach(() => {
  mockExchangeError = null;
  mockUserError = null;
  mockUser = { id: 'user-' + Math.random().toString(36).slice(2) };
  mockOrgId = null;

  mockFrom.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(async () => ({
      data: mockOrgId ? { org_id: mockOrgId } : null,
      error: null,
    })),
  });
});

// ---------------------------------------------------------------------------
// Property 3: Callback routing determined exclusively by org_id
// ---------------------------------------------------------------------------

describe('Route – Property 3: Callback routing is determined exclusively by org_id', () => {
  it('non-null UUID org_id always redirects to /dashboard', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (orgId) => {
          mockOrgId = orgId;
          const res = await GET(makeRequest() as any);
          return getRedirectUrl(res) === 'https://example.com/dashboard';
        }
      ),
      { numRuns: 100 }
    );
  });

  it('null org_id (no row) always redirects to /onboarding', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async (orgId) => {
          mockOrgId = orgId;
          const res = await GET(makeRequest() as any);
          return getRedirectUrl(res) === 'https://example.com/onboarding';
        }
      ),
      { numRuns: 100 }
    );
  });

  it('arbitrary ?next= param never controls the redirect destination', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

    const knownSafeDestinations = [
      'https://example.com/dashboard',
      'https://example.com/onboarding',
    ];

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        fc.oneof(fc.uuid(), fc.constant(null)),
        async (nextValue, orgId) => {
          mockOrgId = orgId;
          const res = await GET(makeRequest({ next: nextValue }) as any);
          const location = getRedirectUrl(res);
          // The redirect must be one of the known safe destinations —
          // the ?next= param must never be used as the redirect target.
          return knownSafeDestinations.includes(location);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: Email-confirmation flow preserved for all type signals
// ---------------------------------------------------------------------------

// **Validates: Requirements 6.1, 6.2, 6.3**
describe('Route – Property 4: Email-confirmation flow preserved for all type signals', () => {
  it('type=signup always redirects to /auth/success', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.uuid(), fc.constant(null)),
        async (orgId) => {
          mockOrgId = orgId;
          const res = await GET(makeRequest({ type: 'signup' }) as any);
          return getRedirectUrl(res) === 'https://example.com/auth/success';
        }
      ),
      { numRuns: 100 }
    );
  });

  it('type=recovery always redirects to /auth/success', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.uuid(), fc.constant(null)),
        async (orgId) => {
          mockOrgId = orgId;
          const res = await GET(makeRequest({ type: 'recovery' }) as any);
          return getRedirectUrl(res) === 'https://example.com/auth/success';
        }
      ),
      { numRuns: 100 }
    );
  });

  it('any type value other than signup/recovery never redirects to /auth/success', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

    // Generate strings that are NOT 'signup' or 'recovery'
    const nonConfirmationTypeArb = fc.string().filter(
      s => s !== 'signup' && s !== 'recovery'
    );

    await fc.assert(
      fc.asyncProperty(
        nonConfirmationTypeArb,
        fc.oneof(fc.uuid(), fc.constant(null)),
        async (typeValue, orgId) => {
          mockOrgId = orgId;
          const params: Record<string, string> = {};
          if (typeValue.length > 0) params.type = typeValue;
          const res = await GET(makeRequest(params) as any);
          const location = getRedirectUrl(res);
          // Must NOT be /auth/success for non-confirmation type values
          if (location === 'https://example.com/auth/success') return false;
          // Must be /dashboard or /onboarding
          return (
            location === 'https://example.com/dashboard' ||
            location === 'https://example.com/onboarding'
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('for arbitrary type values: signup→success, recovery→success, everything else→app', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

    await fc.assert(
      fc.asyncProperty(
        fc.option(fc.string(), { nil: undefined }),
        fc.oneof(fc.uuid(), fc.constant(null)),
        async (typeValue, orgId) => {
          mockOrgId = orgId;
          const params: Record<string, string> = {};
          if (typeValue !== undefined && typeValue !== null) params.type = typeValue;
          const res = await GET(makeRequest(params) as any);
          const location = getRedirectUrl(res);

          if (typeValue === 'signup' || typeValue === 'recovery') {
            return location === 'https://example.com/auth/success';
          } else {
            return (
              location === 'https://example.com/dashboard' ||
              location === 'https://example.com/onboarding'
            );
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
