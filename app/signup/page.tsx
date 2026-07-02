"use client";
// omnis-ui/app/signup/page.tsx
// Omnis RegOps - Account Creation Gateway
//
// Design: Split-screen layout IDENTICAL to /login, fully light-mode locked.
//   Left panel  - clean white signup card.
//   Right panel - soft slate-50 brand / trust-signal panel.
//
// LIGHT-MODE LOCK: No `dark:` variants, no theme switching. The right-side
// branding panel is hardcoded to bg-slate-50 / text-slate-900.

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import {
  ShieldCheck,
  AlertCircle,
  Loader2,
  GitBranch,
  FileCheck2,
  Lock,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import OAuthButtons from "@/components/auth/OAuthButtons";

// ---------------------------------------------------------------------------
// Trust signals
// ---------------------------------------------------------------------------

const trustPoints = [
  {
    icon: ShieldCheck,
    title: "21 CFR Part 11 Compliant",
    body: "Every access event is HMAC-signed and appended to an immutable audit ledger.",
  },
  {
    icon: GitBranch,
    title: "IEC 62304 Traceability",
    body: "CI/CD evidence logs are cryptographically linked to regulatory clause IDs.",
  },
  {
    icon: FileCheck2,
    title: "FDA eSTAR Ready",
    body: "Auto-generate submission-ready Software Documentation Attachments on demand.",
  },
  {
    icon: Lock,
    title: "Zero-Trust Architecture",
    body: "JWT + HMAC double-lock on every ingest endpoint. No anonymous writes.",
  },
];

// ---------------------------------------------------------------------------
// Right branding panel
// ---------------------------------------------------------------------------

function BrandPanel() {
  return (
    <div className="hidden lg:flex lg:w-[52%] xl:w-[55%] flex-col items-center justify-center bg-slate-50 text-slate-900 px-12 py-12 border-l border-slate-200">
      {/* Logo — top of panel */}
      <Link href="/" className="mb-auto flex items-center gap-3 group self-start">
        <div className="flex h-9 w-9 items-center justify-center rounded bg-emerald-50 ring-1 ring-emerald-200 group-hover:ring-emerald-400 transition-all duration-200">
          <ShieldCheck className="h-5 w-5 text-emerald-600" strokeWidth={1.75} />
        </div>
        <div className="leading-none">
          <span className="block text-sm font-bold text-slate-900">Qavro</span>
          <span className="block text-[10px] font-semibold uppercase tracking-widest text-emerald-600">
            FDA Assurance Platform
          </span>
        </div>
      </Link>

      {/* Centered hero content */}
      <div className="flex flex-col items-center text-center max-w-sm py-16">
        <div className="mb-4 inline-flex items-center gap-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-1">
          <span className="h-1.5 w-1.5 rounded bg-emerald-500 animate-pulse" />
          <span className="text-xs font-semibold text-emerald-700">Compliance Vault — Onboarding</span>
        </div>
        <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-slate-900 xl:text-4xl">
          Automate Your
          <br />
          <span className="text-emerald-600">Regulatory Pipeline.</span>
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          Create your workspace and connect your CI/CD pipeline. Evidence logs start
          flowing the moment you push your first commit.
        </p>
        <div className="mt-8 w-full space-y-3 text-left">
          {trustPoints.map((point) => {
            const Icon = point.icon;
            return (
              <div key={point.title} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-white ring-1 ring-slate-200">
                  <Icon className="h-3.5 w-3.5 text-emerald-600" strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">{point.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{point.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <p className="mt-auto text-xs text-slate-500">
        — 2026 Qavro. Access restricted to authorized personnel only.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signup form
// ---------------------------------------------------------------------------

function SignUpForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;

    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${siteUrl}/auth/callback`,
      },
    });

    if (authError) {
      const msg = authError.message.toLowerCase();
      if (
        msg.includes("already registered") ||
        msg.includes("already been registered") ||
        msg.includes("user already exists") ||
        msg.includes("email address is already") ||
        msg.includes("email already in use")
      ) {
        setError("This email is already in use. Please log in or reset your password.");
      } else {
        setError(authError.message);
      }
      setLoading(false);
      return;
    }

    if (data.session) {
      router.refresh();
      router.push("/dashboard");
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

  // -- Confirmation-pending state --------------------------------------------
  if (success) {
    return (
      <div className="flex w-full flex-col items-center justify-center bg-white px-8 py-16 lg:w-[48%] xl:w-[45%]">
        <div className="w-full max-w-md mx-auto text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded bg-emerald-50 ring-1 ring-emerald-200">
            <CheckCircle2 className="h-7 w-7 text-emerald-500" strokeWidth={1.75} />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Check your email</h1>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">
            We sent a confirmation link to{" "}
            <span className="font-semibold text-gray-700">{email}</span>.
            Click it to activate your account.
          </p>
          <p className="mt-6 text-xs text-gray-400">
            Already confirmed?{" "}
            <Link href="/login" className="font-semibold text-gray-700 underline-offset-2 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  // -- Main form -------------------------------------------------------------
  return (
    <div className="flex w-full flex-col items-center justify-center bg-white px-8 py-16 lg:w-[48%] xl:w-[45%]">
      {/* Mobile logo */}
      <Link href="/" className="mb-8 flex flex-col items-center gap-3 lg:hidden group">
        <div className="flex h-12 w-12 items-center justify-center rounded bg-emerald-50 ring-1 ring-emerald-200">
          <ShieldCheck className="h-6 w-6 text-emerald-600" strokeWidth={1.75} />
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-gray-900">Qavro</p>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600">FDA Assurance Platform</p>
        </div>
      </Link>

      <div className="w-full max-w-md mx-auto">
        {/* Header */}
        <div className="mb-7">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Create account</h1>
          <p className="text-sm text-gray-500 mt-2">Set up your RegOps compliance workspace.</p>
        </div>

        {/* Compliance pill */}
        <div className="mb-6 flex items-center gap-2 rounded border border-gray-200 bg-gray-50 px-3.5 py-2.5">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" strokeWidth={2} />
          <p className="text-xs text-gray-600">
            <span className="font-semibold text-gray-800">21 CFR Part 11 Compliant.</span>{" "}
            Account creation is cryptographically logged.
          </p>
        </div>

        <OAuthButtons />

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1"
            >
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@organization.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              className="w-full bg-white border border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 rounded px-4 py-2 text-sm outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className="w-full bg-white border border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 rounded px-4 py-2 text-sm outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          <div>
            <label
              htmlFor="confirm-password"
              className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1"
            >
              Confirm password
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
              className="w-full bg-white border border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 rounded px-4 py-2 text-sm outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2.5 rounded border border-red-200 bg-red-50 px-3.5 py-3">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
              <p className="text-xs leading-relaxed text-red-700">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-2.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating account...
              </>
            ) : (
              "Create Account"
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-gray-800 underline-offset-2 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page export
// ---------------------------------------------------------------------------

export default function SignUpPage() {
  return (
    <div className="relative flex min-h-screen flex-col lg:flex-row">
      {/* Back button */}
      <Link
        href="/"
        aria-label="Back to home"
        className="absolute left-4 top-4 z-20 inline-flex items-center gap-2 rounded bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-4 py-2.5 text-sm font-semibold transition-all"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
        Back
      </Link>

      {/* Signup form — LEFT */}
      <Suspense
        fallback={
          <div className="flex w-full items-center justify-center bg-white lg:w-[48%] xl:w-[45%]">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        }
      >
        <SignUpForm />
      </Suspense>

      {/* Brand panel — RIGHT */}
      <BrandPanel />
    </div>
  );
}
