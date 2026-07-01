"use client";
// omnis-ui/components/auth/OAuthButtons.tsx
// Shared OAuth sign-in buttons for Login and Signup pages.
//
// LIGHT-MODE LOCK: No `dark:` variants. Matches the enterprise palette used
// across all Qavro auth pages.
//
// Security: Uses the browser Supabase client exclusively for signInWithOAuth.
// No tokens, credentials, or session data are written to localStorage,
// sessionStorage, or the DOM.

import { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

// ---------------------------------------------------------------------------
// Google SVG brand icon (official 4-colour spec)
// ---------------------------------------------------------------------------

function GoogleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      aria-hidden="true"
      className="h-5 w-5 shrink-0"
    >
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v8.51h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.14z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// GitHub Invertocat SVG (monochrome, fill="currentColor")
// ---------------------------------------------------------------------------

function GitHubIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
      className="h-5 w-5 shrink-0 text-slate-900"
    >
      <path d="M12 0C5.37 0 0 5.373 0 12c0 5.303 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.015 2.898-.015 3.293 0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// OAuthButtons component
// ---------------------------------------------------------------------------

export default function OAuthButtons() {
  const [loadingProvider, setLoadingProvider] = useState<"google" | "github" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleOAuthSignIn(provider: "google" | "github") {
    setError(null);
    setLoadingProvider(provider);

    const supabase = createClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
    const redirectTo = `${siteUrl}/auth/callback`;

    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });

    if (authError) {
      setError(authError.message);
      setLoadingProvider(null);
    }
    // On success the browser follows the provider redirect — component unmounts naturally.
  }

  const isDisabled = !!loadingProvider;

  return (
    <div className="w-full space-y-3">
      {/* ── Continue with Google ── */}
      <button
        type="button"
        onClick={() => handleOAuthSignIn("google")}
        disabled={isDisabled}
        aria-label="Continue with Google"
        className="w-full flex items-center justify-center gap-3 border border-gray-200 rounded bg-white text-gray-800 font-medium py-2.5 transition-colors hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loadingProvider === "google" ? (
          <Loader2 className="h-5 w-5 animate-spin shrink-0 text-gray-500" />
        ) : (
          <GoogleIcon />
        )}
        Continue with Google
      </button>

      {/* ── Continue with GitHub ── */}
      <button
        type="button"
        onClick={() => handleOAuthSignIn("github")}
        disabled={isDisabled}
        aria-label="Continue with GitHub"
        className="w-full flex items-center justify-center gap-3 border border-gray-200 rounded bg-white text-gray-800 font-medium py-2.5 transition-colors hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loadingProvider === "github" ? (
          <Loader2 className="h-5 w-5 animate-spin shrink-0 text-gray-500" />
        ) : (
          <GitHubIcon />
        )}
        Continue with GitHub
      </button>

      {/* ── Inline error alert ── */}
      {error && (
        <div className="flex items-start gap-2.5 rounded border border-red-200 bg-red-50 px-3.5 py-3">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
          <p className="text-xs leading-relaxed text-red-700">{error}</p>
        </div>
      )}

      {/* ── OR divider ── */}
      <div className="relative flex items-center py-1">
        <div className="flex-grow border-t border-gray-200" />
        <span className="mx-3 flex-shrink text-xs font-medium text-gray-400">OR</span>
        <div className="flex-grow border-t border-gray-200" />
      </div>
    </div>
  );
}
