// Feature: oauth-social-login, Property 1: redirectTo URL construction is universal

/**
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4
 *
 * Property 1: For any valid string value of NEXT_PUBLIC_SITE_URL and for any
 * supported provider (google or github), clicking the corresponding OAuth
 * button must call supabase.auth.signInWithOAuth with a redirectTo value equal
 * to `<NEXT_PUBLIC_SITE_URL>/auth/callback` — with no double-slash, no
 * trailing slash artifact, and no hardcoded domain.
 */

import * as fc from 'fast-check';
import { render, fireEvent, act, within } from '@testing-library/react';
import OAuthButtons from '../OAuthButtons';

// ---------------------------------------------------------------------------
// Mock @/utils/supabase/client
// vi.mock is hoisted so the mock is registered before any module imports it.
// ---------------------------------------------------------------------------

const mockSignInWithOAuth = vi.fn();

vi.mock('@/utils/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithOAuth: mockSignInWithOAuth,
    },
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the expected redirectTo from the raw base URL, mirroring OAuthButtons logic. */
function expectedRedirectTo(rawBase: string): string {
  return rawBase.replace(/\/$/, '') + '/auth/callback';
}

/** Capture the redirectTo value from the last signInWithOAuth call. */
function capturedRedirectTo(): string | undefined {
  const calls = mockSignInWithOAuth.mock.calls;
  if (calls.length === 0) return undefined;
  const lastCall = calls[calls.length - 1];
  return (lastCall?.[0] as { options?: { redirectTo?: string } })?.options?.redirectTo;
}

/** Capture the provider from the last signInWithOAuth call. */
function capturedProvider(): string | undefined {
  const calls = mockSignInWithOAuth.mock.calls;
  if (calls.length === 0) return undefined;
  return (calls[calls.length - 1]?.[0] as { provider?: string })?.provider;
}

// ---------------------------------------------------------------------------
// Arbitrary: valid HTTPS base URL strings (with/without trailing slash)
// ---------------------------------------------------------------------------

/**
 * Generates realistic HTTPS origin strings, optionally with a trailing slash.
 * Covers the main cases the component will see in production:
 *   - https://example.com
 *   - https://example.com/
 *   - https://app.example.io
 *   - https://my-app.vercel.app/
 *   - https://staging.omnis.app
 */
const hostnameArb = fc.oneof(
  fc.constant('example.com'),
  fc.constant('app.example.io'),
  fc.constant('my-app.vercel.app'),
  fc.constant('staging.omnis.app'),
  fc.constant('localhost:3000'),
  // Generate hostname from label parts to cover varied domains
  fc.tuple(
    fc.stringMatching(/^[a-z][a-z0-9-]{1,10}$/),
    fc.stringMatching(/^[a-z]{2,6}$/),
  ).map(([sub, tld]) => `${sub}.${tld}`),
);

const baseUrlArb = fc.tuple(hostnameArb, fc.boolean()).map(
  ([hostname, hasTrailingSlash]) =>
    `https://${hostname}${hasTrailingSlash ? '/' : ''}`,
);

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  vi.resetAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
});

// ---------------------------------------------------------------------------
// Property 1 tests
// ---------------------------------------------------------------------------

describe('OAuthButtons – Property 1: redirectTo URL construction is universal', () => {
  it('Google button: redirectTo equals normalizedBase + /auth/callback for any base URL', async () => {
    mockSignInWithOAuth.mockResolvedValue({ error: null });

    await fc.assert(
      fc.asyncProperty(baseUrlArb, async (rawBase) => {
        process.env.NEXT_PUBLIC_SITE_URL = rawBase;
        mockSignInWithOAuth.mockClear();

        const container = document.createElement('div');
        document.body.appendChild(container);
        const { unmount } = render(<OAuthButtons />, { container });
        const q = within(container);

        const googleButton = q.getByRole('button', { name: /continue with google/i });
        await act(async () => {
          fireEvent.click(googleButton);
        });
        await act(async () => {});

        const redirectTo = capturedRedirectTo();
        const provider = capturedProvider();

        unmount();
        document.body.removeChild(container);

        // Provider must be google
        if (provider !== 'google') return false;
        // redirectTo must be defined
        if (redirectTo === undefined) return false;

        const expected = expectedRedirectTo(rawBase);

        // Must equal the normalised base + /auth/callback
        if (redirectTo !== expected) return false;

        // Must not contain double-slash after the protocol scheme
        const withoutProtocol = redirectTo.slice(redirectTo.indexOf('://') + 3);
        if (withoutProtocol.includes('//')) return false;

        // Must end with /auth/callback (no trailing slash)
        if (!redirectTo.endsWith('/auth/callback')) return false;

        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('GitHub button: redirectTo equals normalizedBase + /auth/callback for any base URL', async () => {
    mockSignInWithOAuth.mockResolvedValue({ error: null });

    await fc.assert(
      fc.asyncProperty(baseUrlArb, async (rawBase) => {
        process.env.NEXT_PUBLIC_SITE_URL = rawBase;
        mockSignInWithOAuth.mockClear();

        const container = document.createElement('div');
        document.body.appendChild(container);
        const { unmount } = render(<OAuthButtons />, { container });
        const q = within(container);

        const githubButton = q.getByRole('button', { name: /continue with github/i });
        await act(async () => {
          fireEvent.click(githubButton);
        });
        await act(async () => {});

        const redirectTo = capturedRedirectTo();
        const provider = capturedProvider();

        unmount();
        document.body.removeChild(container);

        if (provider !== 'github') return false;
        if (redirectTo === undefined) return false;

        const expected = expectedRedirectTo(rawBase);

        if (redirectTo !== expected) return false;

        const withoutProtocol = redirectTo.slice(redirectTo.indexOf('://') + 3);
        if (withoutProtocol.includes('//')) return false;

        if (!redirectTo.endsWith('/auth/callback')) return false;

        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('Both providers: trailing slash in base URL never produces double-slash in redirectTo', async () => {
    mockSignInWithOAuth.mockResolvedValue({ error: null });

    const trailingSlashArb = hostnameArb.map((h) => `https://${h}/`);

    await fc.assert(
      fc.asyncProperty(
        trailingSlashArb,
        fc.constantFrom<'google' | 'github'>('google', 'github'),
        async (rawBase, provider) => {
          process.env.NEXT_PUBLIC_SITE_URL = rawBase;
          mockSignInWithOAuth.mockClear();

          const container = document.createElement('div');
          document.body.appendChild(container);
          const { unmount } = render(<OAuthButtons />, { container });
          const q = within(container);

          const label =
            provider === 'google'
              ? /continue with google/i
              : /continue with github/i;
          const button = q.getByRole('button', { name: label });

          await act(async () => {
            fireEvent.click(button);
          });
          await act(async () => {});

          const redirectTo = capturedRedirectTo();

          unmount();
          document.body.removeChild(container);

          if (redirectTo === undefined) return false;

          // Core invariant: no double-slash after the scheme separator
          const withoutProtocol = redirectTo.slice(redirectTo.indexOf('://') + 3);
          return !withoutProtocol.includes('//');
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Inline error display for any Supabase error
// Feature: oauth-social-login, Property 2: Inline error display for any Supabase error
// Validates: Requirements 2.4
// ---------------------------------------------------------------------------

/**
 * Property 2: For any error string returned by supabase.auth.signInWithOAuth,
 * the OAuthButtons component must render that error message text in a visible
 * inline element accessible to the user — regardless of the error content,
 * length, or provider that triggered it.
 */
describe('OAuthButtons – Property 2: Inline error display for any Supabase error', () => {
  it('renders the exact error message text for any non-empty Supabase error string', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate non-empty strings that have at least one non-whitespace character
        // (whitespace-only strings are not meaningful as visible error messages)
        fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
        async (generatedString) => {
          mockSignInWithOAuth.mockResolvedValueOnce({
            data: {},
            error: { message: generatedString },
          });

          const container = document.createElement('div');
          document.body.appendChild(container);
          const { unmount } = render(<OAuthButtons />, { container });
          const q = within(container);

          const googleButton = q.getByRole('button', { name: /continue with google/i });
          await act(async () => {
            fireEvent.click(googleButton);
          });
          await act(async () => {});

          // The error paragraph element must be present and contain the generated error string.
          // We query the error paragraph directly by its CSS class to avoid getByText
          // whitespace-normalization edge cases for strings with trailing spaces.
          const errorParagraph = container.querySelector('p.text-red-700');
          if (!errorParagraph) return false;

          // The paragraph's textContent must equal the generated error message exactly
          if (errorParagraph.textContent !== generatedString) return false;

          unmount();
          document.body.removeChild(container);

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});
