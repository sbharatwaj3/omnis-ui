// Feature: oauth-social-login, Property 3: Callback route routing is determined exclusively by org_id
// Feature: oauth-social-login, Property 4: Email-confirmation flow is preserved for all type signals
// Feature: oauth-callback-race-condition, Property 2 (FIXED): Preservation — Non-Buggy Inputs Produce Identical Routing
// Feature: oauth-callback-race-condition, Property 4: Identity Derives Exclusively from JWT — URL Params Never Influence Routing

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

// ---------------------------------------------------------------------------
// Mock waitForUserProfile so route-level tests control the helper directly.
// The helper itself is tested in waitForUserProfile.property.test.ts.
// ---------------------------------------------------------------------------
let mockWaitForUserProfileResult: { org_id: string | null } | null = { org_id: null };

vi.mock('@/utils/supabase/waitForUserProfile', () => ({
  waitForUserProfile: vi.fn(async () => mockWaitForUserProfileResult),
  MAX_POLL_ATTEMPTS: 5,
}));

// Import after vi.mock so we get the mocked version
import { waitForUserProfile } from '@/utils/supabase/waitForUserProfile';

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
  // Default: stub row present but org_id null → needs onboarding
  mockWaitForUserProfileResult = { org_id: null };

  // Fixed route uses waitForUserProfile → .maybeSingle() internally.
  // Expose maybeSingle on the mock chain for tests that override mockFrom directly.
  mockFrom.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => ({
      data: mockOrgId !== undefined ? { org_id: mockOrgId } : null,
      error: null,
    })),
  });

  // Reset the waitForUserProfile mock call history each test
  vi.mocked(waitForUserProfile).mockClear();
  vi.mocked(waitForUserProfile).mockImplementation(async () => mockWaitForUserProfileResult);
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
          mockWaitForUserProfileResult = { org_id: orgId };
          const res = await GET(makeRequest() as any);
          return getRedirectUrl(res) === 'https://example.com/dashboard';
        }
      ),
      { numRuns: 100 }
    );
  });

  it('null org_id (stub row) always redirects to /onboarding', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async (_orgId) => {
          mockWaitForUserProfileResult = { org_id: null };
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
          mockWaitForUserProfileResult = { org_id: orgId };
          const res = await GET(makeRequest({ next: nextValue }) as any);
          const location = getRedirectUrl(res);
          return knownSafeDestinations.includes(location);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4 (oauth-social-login): Email-confirmation flow preserved for all type signals
// ---------------------------------------------------------------------------

// **Validates: Requirements 6.1, 6.2, 6.3**
describe('Route – Property 4: Email-confirmation flow preserved for all type signals', () => {
  it('type=signup always redirects to /auth/success', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.uuid(), fc.constant(null)),
        async (orgId) => {
          mockWaitForUserProfileResult = { org_id: orgId };
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
          mockWaitForUserProfileResult = { org_id: orgId };
          const res = await GET(makeRequest({ type: 'recovery' }) as any);
          return getRedirectUrl(res) === 'https://example.com/auth/success';
        }
      ),
      { numRuns: 100 }
    );
  });

  it('any type value other than signup/recovery never redirects to /auth/success', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

    const nonConfirmationTypeArb = fc.string().filter(
      s => s !== 'signup' && s !== 'recovery'
    );

    await fc.assert(
      fc.asyncProperty(
        nonConfirmationTypeArb,
        fc.oneof(fc.uuid(), fc.constant(null)),
        async (typeValue, orgId) => {
          mockWaitForUserProfileResult = { org_id: orgId };
          const params: Record<string, string> = {};
          if (typeValue.length > 0) params.type = typeValue;
          const res = await GET(makeRequest(params) as any);
          const location = getRedirectUrl(res);
          if (location === 'https://example.com/auth/success') return false;
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
          mockWaitForUserProfileResult = { org_id: orgId };
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

// ---------------------------------------------------------------------------
// Feature: oauth-callback-race-condition, Property 2: Preservation — Non-Buggy Inputs Produce Identical Routing
// (Baseline preservation tests — run on UNFIXED route, must pass; carried forward to FIXED route)
// **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
// ---------------------------------------------------------------------------

describe('Route – Property 2 (oauth-callback-race-condition): Preservation — Non-Buggy Inputs Produce Identical Routing', () => {

  describe('2a: type param routing preserved', () => {
    it('type=signup always redirects to /auth/success regardless of org_id', async () => {
      process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

      await fc.assert(
        fc.asyncProperty(
          fc.oneof(fc.uuid(), fc.constant(null)),
          async (orgId) => {
            mockWaitForUserProfileResult = { org_id: orgId };
            const res = await GET(makeRequest({ type: 'signup' }) as any);
            return getRedirectUrl(res) === 'https://example.com/auth/success';
          }
        ),
        { numRuns: 100 }
      );
    });

    it('type=recovery always redirects to /auth/success regardless of org_id', async () => {
      process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

      await fc.assert(
        fc.asyncProperty(
          fc.oneof(fc.uuid(), fc.constant(null)),
          async (orgId) => {
            mockWaitForUserProfileResult = { org_id: orgId };
            const res = await GET(makeRequest({ type: 'recovery' }) as any);
            return getRedirectUrl(res) === 'https://example.com/auth/success';
          }
        ),
        { numRuns: 100 }
      );
    });

    it('any non-signup/recovery type with non-null org_id redirects to /dashboard, never /auth/success', async () => {
      process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

      const nonConfirmationTypeArb = fc.option(
        fc.string().filter(s => s !== 'signup' && s !== 'recovery'),
        { nil: undefined }
      );

      await fc.assert(
        fc.asyncProperty(
          nonConfirmationTypeArb,
          fc.uuid(),
          async (typeValue, orgId) => {
            mockWaitForUserProfileResult = { org_id: orgId };
            const params: Record<string, string> = {};
            if (typeValue !== undefined) params.type = typeValue;
            const res = await GET(makeRequest(params) as any);
            const location = getRedirectUrl(res);
            return location === 'https://example.com/dashboard';
          }
        ),
        { numRuns: 100 }
      );
    });

    it('any non-signup/recovery type with null org_id redirects to /onboarding, never /auth/success', async () => {
      process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

      const nonConfirmationTypeArb = fc.option(
        fc.string().filter(s => s !== 'signup' && s !== 'recovery'),
        { nil: undefined }
      );

      await fc.assert(
        fc.asyncProperty(
          nonConfirmationTypeArb,
          async (typeValue) => {
            mockWaitForUserProfileResult = { org_id: null };
            const params: Record<string, string> = {};
            if (typeValue !== undefined) params.type = typeValue;
            const res = await GET(makeRequest(params) as any);
            const location = getRedirectUrl(res);
            return location === 'https://example.com/onboarding';
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // -------------------------------------------------------------------------
  // 2b: Immediately visible row, non-null org_id UUID → /dashboard
  // -------------------------------------------------------------------------
  describe('2b: Immediately visible row with non-null org_id → /dashboard', () => {
    it('any non-null UUID org_id from an immediately visible row always redirects to /dashboard', async () => {
      process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          async (orgId) => {
            // Simulate row immediately visible on first poll attempt
            mockWaitForUserProfileResult = { org_id: orgId };
            const res = await GET(makeRequest() as any);
            return getRedirectUrl(res) === 'https://example.com/dashboard';
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // -------------------------------------------------------------------------
  // 2c: Immediately visible stub row, org_id = null → /onboarding
  // -------------------------------------------------------------------------
  describe('2c: Immediately visible stub row with org_id = null → /onboarding', () => {
    it('org_id = null from an immediately visible row always redirects to /onboarding', async () => {
      process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async (_orgId) => {
            mockWaitForUserProfileResult = { org_id: null };
            const res = await GET(makeRequest() as any);
            return getRedirectUrl(res) === 'https://example.com/onboarding';
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // -------------------------------------------------------------------------
  // 2d: exchangeCodeForSession error → /login?error=auth_callback_failed
  // -------------------------------------------------------------------------
  describe('2d: exchangeCodeForSession error path preserved', () => {
    it('any exchangeCodeForSession error always redirects to /login?error=auth_callback_failed', async () => {
      process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }),
          async (errorMessage) => {
            mockExchangeError = { message: errorMessage };
            const res = await GET(makeRequest() as any);
            return getRedirectUrl(res) === 'https://example.com/login?error=auth_callback_failed';
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // -------------------------------------------------------------------------
  // 2e: getUser() error or null → /login?error=session_not_established
  // -------------------------------------------------------------------------
  describe('2e: getUser error/null path preserved', () => {
    it('any getUser error always redirects to /login?error=session_not_established', async () => {
      process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }),
          async (errorMessage) => {
            mockUserError = { message: errorMessage };
            mockUser = null;
            const res = await GET(makeRequest() as any);
            return getRedirectUrl(res) === 'https://example.com/login?error=session_not_established';
          }
        ),
        { numRuns: 100 }
      );
    });

    it('null user (no error object) always redirects to /login?error=session_not_established', async () => {
      process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async (_user) => {
            mockUserError = null;
            mockUser = null;
            const res = await GET(makeRequest() as any);
            return getRedirectUrl(res) === 'https://example.com/login?error=session_not_established';
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // -------------------------------------------------------------------------
  // 2f: No code param → /login
  // -------------------------------------------------------------------------
  describe('2f: No code param → /login preserved', () => {
    it('request without code param always redirects to /login', async () => {
      process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

      await fc.assert(
        fc.asyncProperty(
          fc.record({
            type: fc.option(fc.string(), { nil: undefined }),
            next: fc.option(fc.string(), { nil: undefined }),
          }),
          async (extraParams) => {
            const url = new URL('https://example.com/auth/callback');
            if (extraParams.type !== undefined) url.searchParams.set('type', extraParams.type);
            if (extraParams.next !== undefined) url.searchParams.set('next', extraParams.next);
            const requestWithoutCode = new Request(url.toString());

            const res = await GET(requestWithoutCode as any);
            return getRedirectUrl(res) === 'https://example.com/login';
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Feature: oauth-callback-race-condition, Property 2 (FIXED route): Preservation
// Tests that confirm the FIXED route's behavior matches the original for non-buggy inputs,
// and that waitForUserProfile is NOT called for email-confirmation flows.
// **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
// ---------------------------------------------------------------------------

describe('Route – Property 2 (FIXED): Preservation — Non-Buggy Inputs Produce Identical Routing on Fixed Route', () => {

  // -------------------------------------------------------------------------
  // type=signup → /auth/success; waitForUserProfile must NOT be called
  // -------------------------------------------------------------------------
  it('type=signup always redirects to /auth/success and never calls waitForUserProfile', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.uuid(), fc.constant(null)),
        async (orgId) => {
          mockWaitForUserProfileResult = { org_id: orgId };
          vi.mocked(waitForUserProfile).mockClear();

          const res = await GET(makeRequest({ type: 'signup' }) as any);

          const redirectOk = getRedirectUrl(res) === 'https://example.com/auth/success';
          const notCalled = vi.mocked(waitForUserProfile).mock.calls.length === 0;
          return redirectOk && notCalled;
        }
      ),
      { numRuns: 100 }
    );
  });

  // -------------------------------------------------------------------------
  // type=recovery → /auth/success; waitForUserProfile must NOT be called
  // -------------------------------------------------------------------------
  it('type=recovery always redirects to /auth/success and never calls waitForUserProfile', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.uuid(), fc.constant(null)),
        async (orgId) => {
          mockWaitForUserProfileResult = { org_id: orgId };
          vi.mocked(waitForUserProfile).mockClear();

          const res = await GET(makeRequest({ type: 'recovery' }) as any);

          const redirectOk = getRedirectUrl(res) === 'https://example.com/auth/success';
          const notCalled = vi.mocked(waitForUserProfile).mock.calls.length === 0;
          return redirectOk && notCalled;
        }
      ),
      { numRuns: 100 }
    );
  });

  // -------------------------------------------------------------------------
  // non-signup/recovery + non-null org_id → /dashboard
  // -------------------------------------------------------------------------
  it('any non-signup/recovery type + non-null org_id always redirects to /dashboard', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

    const nonConfirmationTypeArb = fc.option(
      fc.string().filter(s => s !== 'signup' && s !== 'recovery'),
      { nil: undefined }
    );

    await fc.assert(
      fc.asyncProperty(
        nonConfirmationTypeArb,
        fc.uuid(),
        async (typeValue, orgId) => {
          mockWaitForUserProfileResult = { org_id: orgId };
          const params: Record<string, string> = {};
          if (typeValue !== undefined) params.type = typeValue;
          const res = await GET(makeRequest(params) as any);
          return getRedirectUrl(res) === 'https://example.com/dashboard';
        }
      ),
      { numRuns: 100 }
    );
  });

  // -------------------------------------------------------------------------
  // non-signup/recovery + null org_id → /onboarding
  // -------------------------------------------------------------------------
  it('any non-signup/recovery type + null org_id always redirects to /onboarding', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

    const nonConfirmationTypeArb = fc.option(
      fc.string().filter(s => s !== 'signup' && s !== 'recovery'),
      { nil: undefined }
    );

    await fc.assert(
      fc.asyncProperty(
        nonConfirmationTypeArb,
        async (typeValue) => {
          mockWaitForUserProfileResult = { org_id: null };
          const params: Record<string, string> = {};
          if (typeValue !== undefined) params.type = typeValue;
          const res = await GET(makeRequest(params) as any);
          return getRedirectUrl(res) === 'https://example.com/onboarding';
        }
      ),
      { numRuns: 100 }
    );
  });

  // -------------------------------------------------------------------------
  // exchangeCodeForSession error path preserved
  // -------------------------------------------------------------------------
  it('any exchangeCodeForSession error redirects to /login?error=auth_callback_failed', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        async (errorMessage) => {
          mockExchangeError = { message: errorMessage };
          const res = await GET(makeRequest() as any);
          return getRedirectUrl(res) === 'https://example.com/login?error=auth_callback_failed';
        }
      ),
      { numRuns: 100 }
    );
  });

  // -------------------------------------------------------------------------
  // getUser error/null path preserved
  // -------------------------------------------------------------------------
  it('any getUser error redirects to /login?error=session_not_established', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        async (errorMessage) => {
          mockUserError = { message: errorMessage };
          mockUser = null;
          const res = await GET(makeRequest() as any);
          return getRedirectUrl(res) === 'https://example.com/login?error=session_not_established';
        }
      ),
      { numRuns: 100 }
    );
  });

  // -------------------------------------------------------------------------
  // No code param path preserved
  // -------------------------------------------------------------------------
  it('request without code param always redirects to /login', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          type: fc.option(fc.string(), { nil: undefined }),
          next: fc.option(fc.string(), { nil: undefined }),
        }),
        async (extraParams) => {
          const url = new URL('https://example.com/auth/callback');
          if (extraParams.type !== undefined) url.searchParams.set('type', extraParams.type);
          if (extraParams.next !== undefined) url.searchParams.set('next', extraParams.next);
          const requestWithoutCode = new Request(url.toString());

          const res = await GET(requestWithoutCode as any);
          return getRedirectUrl(res) === 'https://example.com/login';
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: oauth-callback-race-condition, Property 4: Identity Derives Exclusively from JWT
// URL Params Never Influence Routing
// **Validates: Requirements 2.5**
// ---------------------------------------------------------------------------

describe('Route – Property 4 (oauth-callback-race-condition): Identity Derives Exclusively from JWT — URL Params Never Influence Routing', () => {

  // -------------------------------------------------------------------------
  // Arbitrary URL params never appear in or influence the redirect destination
  // -------------------------------------------------------------------------
  it('arbitrary URL params never appear in the redirect URL and routing is always safe', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

    const safeDestinations = [
      'https://example.com/dashboard',
      'https://example.com/onboarding',
      'https://example.com/auth/success',
    ];
    const safeDestinationPrefixes = [
      'https://example.com/login?error=',
    ];

    // Arbitrary extra query params an attacker might inject
    const extraParamsArb = fc.record({
      next: fc.option(fc.string({ minLength: 1, maxLength: 40 }), { nil: undefined }),
      user_id: fc.option(fc.uuid(), { nil: undefined }),
      org_id: fc.option(fc.uuid(), { nil: undefined }),
      email: fc.option(fc.emailAddress(), { nil: undefined }),
      extraKey: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
      extraValue: fc.option(fc.string({ minLength: 1, maxLength: 40 }), { nil: undefined }),
    });

    const knownOrgId = 'aaaaaaaa-0000-4000-8000-000000000001';

    await fc.assert(
      fc.asyncProperty(
        extraParamsArb,
        fc.oneof(fc.uuid(), fc.constant(null)),
        async (extraParams, helperOrgId) => {
          // waitForUserProfile returns a known org_id driven by the JWT (not URL)
          mockWaitForUserProfileResult = { org_id: helperOrgId };

          // Build request with extra injected URL params
          const params: Record<string, string> = {};
          if (extraParams.next !== undefined) params.next = extraParams.next;
          if (extraParams.user_id !== undefined) params.user_id = extraParams.user_id;
          if (extraParams.org_id !== undefined) params.org_id = extraParams.org_id;
          if (extraParams.email !== undefined) params.email = extraParams.email;
          if (extraParams.extraKey !== undefined && extraParams.extraValue !== undefined) {
            params[extraParams.extraKey] = extraParams.extraValue;
          }

          const res = await GET(makeRequest(params) as any);
          const location = getRedirectUrl(res);

          // Must be one of the known safe destinations (exact or prefix match)
          const isValidDestination =
            safeDestinations.includes(location) ||
            safeDestinationPrefixes.some(prefix => location.startsWith(prefix));

          if (!isValidDestination) return false;

          // The injected org_id URL param must never appear as the routing decision.
          // Routing must come from waitForUserProfile (helperOrgId), not from URL params.
          if (extraParams.org_id !== undefined) {
            // If the attacker's org_id was used, we'd see /dashboard with their value
            // in the path or query. The redirect URL must not contain the attacker org_id.
            // (The URL itself is just /dashboard or /onboarding — no org_id in path.)
            // We verify by checking the location does NOT contain the injected org_id value
            // as a meaningful segment.
            if (location.includes(extraParams.org_id)) return false;
          }

          // Verify routing decision aligns with what waitForUserProfile returned (helperOrgId),
          // not any URL param. For non-error, non-email-confirmation flows:
          if (
            location !== 'https://example.com/auth/success' &&
            !location.startsWith('https://example.com/login?error=')
          ) {
            if (helperOrgId !== null) {
              if (location !== 'https://example.com/dashboard') return false;
            } else {
              if (location !== 'https://example.com/onboarding') return false;
            }
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  // -------------------------------------------------------------------------
  // org_id injected via URL never overrides the org_id from waitForUserProfile
  // -------------------------------------------------------------------------
  it('injected ?org_id= URL param never causes /dashboard when waitForUserProfile returns null org_id', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // attacker injects a non-null org_id in the URL
        async (attackerOrgId) => {
          // waitForUserProfile (JWT-driven) returns null org_id → should go to /onboarding
          mockWaitForUserProfileResult = { org_id: null };

          const res = await GET(makeRequest({ org_id: attackerOrgId }) as any);
          const location = getRedirectUrl(res);

          // Must NOT go to /dashboard — the injected org_id must be ignored
          return location === 'https://example.com/onboarding';
        }
      ),
      { numRuns: 100 }
    );
  });

  // -------------------------------------------------------------------------
  // Routing is consistent regardless of arbitrary extra URL params
  // -------------------------------------------------------------------------
  it('routing decision is consistent regardless of arbitrary extra URL params present', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

    const knownOrgId = 'bbbbbbbb-0000-4000-8000-000000000002';

    await fc.assert(
      fc.asyncProperty(
        // Generate between 0 and 5 arbitrary key-value pairs
        fc.array(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s !== 'code' && s !== 'type'),
            fc.string({ minLength: 1, maxLength: 40 })
          ),
          { minLength: 0, maxLength: 5 }
        ),
        async (extraKVPairs) => {
          mockWaitForUserProfileResult = { org_id: knownOrgId };

          const params: Record<string, string> = {};
          for (const [k, v] of extraKVPairs) {
            params[k] = v;
          }

          const res = await GET(makeRequest(params) as any);
          const location = getRedirectUrl(res);

          // With a known non-null org_id from the helper, always /dashboard
          return location === 'https://example.com/dashboard';
        }
      ),
      { numRuns: 100 }
    );
  });
});
