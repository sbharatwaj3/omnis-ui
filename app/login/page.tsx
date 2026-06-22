"use client";
// omnis-ui/app/login/page.tsx
// Omnis RegOps — Authentication Gateway
//
// Design: Split-screen enterprise layout.
//   Left panel  — clean white auth card.
//   Right panel — dark brand / trust-signal panel.

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import {
  ShieldCheck,
  AlertCircle,
  Loader2,
  GitBranch,
  FileCheck2,
  Lock,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Trust signals
// ---------------------------------------------------------------------------

const trustPoints = [
  {
    icon: ShieldCheck,
    title: "21 CFR Part 11",
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
    <div className="hidden lg:flex lg:w-[52%] xl:w-[55%] flex-col items-center justify-center bg-slate-900 px-12 py-12">
      {/* Logo — top of panel */}
      <Link href="/" className="mb-auto flex items-center gap-3 group self-start">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30 group-hover:ring-emerald-400 transition-all duration-200">
          <ShieldCheck className="h-5 w-5 text-emerald-400" strokeWidth={1.75} />
        </div>
        <div className="leading-none">
          <span className="block text-sm font-bold text-slate-100">Omnis MedTech Corp</span>
          <span className="block text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
            RegOps Platform
          </span>
        </div>
      </Link>

      {/* Centered hero content */}
      <div className="flex flex-col items-center text-center max-w-sm py-16">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-800 bg-emerald-950/60 px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-semibold text-emerald-300">Compliance Vault — Active</span>
        </div>
        <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-white xl:text-4xl">
          Your Regulatory
          <br />
          <span className="text-emerald-400">Evidence — Secured.</span>
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-slate-400">
          Secure access to your compliance environment. All sessions are authenticated,
          time-stamped, and recorded under 21 CFR Part 11 electronic records requirements.
        </p>
        <div className="mt-8 w-full space-y-3 text-left">
          {trustPoints.map((point) => {
            const Icon = point.icon;
            return (
              <div key={point.title} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 ring-1 ring-slate-700">
                  <Icon className="h-3.5 w-3.5 text-emerald-400" strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-200">{point.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{point.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <p className="mt-auto text-xs text-slate-600">
        © 2026 Omnis MedTech Corp. Access restricted to authorized personnel only.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auth form
// ---------------------------------------------------------------------------

function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("next") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.refresh();
    router.push(redirectTo);
  }

  return (
    <div className="flex w-full flex-col items-center justify-center bg-white px-8 py-16 lg:w-[48%] xl:w-[45%]">
      {/* Mobile logo */}
      <Link href="/" className="mb-8 flex flex-col items-center gap-3 lg:hidden group">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 shadow-lg">
          <ShieldCheck className="h-6 w-6 text-emerald-400" strokeWidth={1.75} />
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-gray-900">Omnis MedTech Corp</p>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600">RegOps Platform</p>
        </div>
      </Link>

      <div className="w-full max-w-md mx-auto">
        {/* Header */}
        <div className="mb-7">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Sign in</h1>
          <p className="text-sm text-gray-500 mt-2">Secure access to your compliance environment.</p>
        </div>

        {/* Compliance pill */}
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" strokeWidth={2} />
          <p className="text-xs text-gray-600">
            <span className="font-semibold text-gray-800">21 CFR Part 11 Compliant.</span>{" "}
            This session will be cryptographically logged.
          </p>
        </div>

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
              className="w-full bg-white border border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 rounded-md shadow-sm px-4 py-2 text-sm outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
              autoComplete="current-password"
              required
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className="w-full bg-white border border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 rounded-md shadow-sm px-4 py-2 text-sm outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
              <p className="text-xs leading-relaxed text-red-700">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-2.5 rounded-md transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Authenticating…
              </>
            ) : (
              "Sign in to RegOps"
            )}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-500">
          <Link href="/forgot-password" className="font-semibold text-gray-800 underline-offset-2 hover:underline">
            Forgot your password?
          </Link>
        </p>

        <p className="mt-3 text-center text-sm text-gray-500">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-semibold text-gray-800 underline-offset-2 hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page export
// ---------------------------------------------------------------------------

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen flex-col lg:flex-row">
      {/* Back button */}
      <Link
        href="/"
        aria-label="Back to home"
        className="absolute left-4 top-4 z-20 inline-flex items-center gap-2 rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-4 py-2.5 text-sm font-semibold shadow-sm transition-all"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
        Back
      </Link>

      {/* Auth form — LEFT */}
      <Suspense
        fallback={
          <div className="flex w-full items-center justify-center bg-white lg:w-[48%] xl:w-[45%]">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        }
      >
        <AuthForm />
      </Suspense>

      {/* Brand panel — RIGHT */}
      <BrandPanel />
    </div>
  );
}
