"use client";
// omnis-ui/app/login/page.tsx
// Omnis RegOps — Authentication Gateway
//
// Client Component — auth form interactions require browser APIs.
// Design: Split-screen clinical enterprise layout.
//   Left panel  — brand identity, trust signals, regulatory badges.
//   Right panel — clean centered auth card.
// Dark mode ready via Tailwind dark: classes.
//
// NOTE: AuthForm uses useSearchParams() which requires a Suspense boundary
// when used as a Next.js page. The Suspense wrapper is at the page-export
// level so the static shell renders correctly during SSR.

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  AlertCircle,
  Loader2,
  GitBranch,
  FileCheck2,
  Lock,
} from "lucide-react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Trust signals displayed in the left panel
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
// Left branding panel (Server-renderable — no state)
// ---------------------------------------------------------------------------

function BrandPanel() {
  return (
    <div className="hidden lg:flex lg:w-[52%] xl:w-[55%] flex-col justify-between bg-slate-900 px-12 py-12 dark:bg-slate-950">
      {/* Logo — links back to landing page */}
      <Link href="/" className="flex items-center gap-3 group">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30 group-hover:ring-emerald-400 transition-all duration-200">
          <ShieldCheck className="h-5 w-5 text-emerald-400" strokeWidth={1.75} />
        </div>
        <div className="leading-none">
          <span className="block text-sm font-bold text-slate-100">
            Omnis MedTech Corp
          </span>
          <span className="block text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
            RegOps Platform
          </span>
        </div>
      </Link>

      {/* Hero copy */}
      <div className="max-w-md">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-800 bg-emerald-950/60 px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-semibold text-emerald-300">
            Compliance Vault — Active
          </span>
        </div>
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-white xl:text-4xl">
          Your Regulatory
          <br />
          <span className="text-emerald-400">Evidence — Secured.</span>
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-slate-400">
          Secure access to your compliance environment. All sessions are
          authenticated, time-stamped, and recorded under 21 CFR Part 11
          electronic records requirements.
        </p>

        {/* Trust points */}
        <div className="mt-8 space-y-4">
          {trustPoints.map((point) => {
            const Icon = point.icon;
            return (
              <div key={point.title} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 ring-1 ring-slate-700">
                  <Icon className="h-3.5 w-3.5 text-emerald-400" strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-200">{point.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                    {point.body}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <p className="text-xs text-slate-600">
        © 2026 Omnis MedTech Corp. Access restricted to
        authorized personnel only.
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

    // Session established — flush Server Component cache so middleware
    // sees the new session cookie on the next request.
    router.refresh();
    router.push(redirectTo);
  }

  return (
    <div className="flex w-full flex-col items-center justify-center px-6 py-12 lg:w-[48%] xl:w-[45%] bg-white dark:bg-slate-950">
      {/* Mobile logo — only visible when left panel is hidden */}
      <Link href="/" className="mb-8 flex flex-col items-center gap-3 lg:hidden group">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 shadow-lg group-hover:ring-2 group-hover:ring-emerald-400 transition-all dark:bg-slate-800">
          <ShieldCheck className="h-6 w-6 text-emerald-400" strokeWidth={1.75} />
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Omnis MedTech Corp
          </p>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
            RegOps Platform
          </p>
        </div>
      </Link>

      {/* Card */}
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="mb-7">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Sign in
          </h2>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            Secure access to your compliance environment.
          </p>
        </div>

        {/* Compliance pill */}
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-900">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" strokeWidth={2} />
          <p className="text-xs text-slate-600 dark:text-slate-400">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              21 CFR Part 11 Compliant.
            </span>{" "}
            This session will be cryptographically logged.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label
              htmlFor="email"
              className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              Email address
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@organization.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              className="h-11 border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-600"
            />
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="password"
              className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              Password
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className="h-11 border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-600"
            />
          </div>

          {/* Error banner */}
          {error && (
            <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 dark:border-red-900/60 dark:bg-red-950/40">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500 dark:text-red-400" />
              <p className="text-xs leading-relaxed text-red-700 dark:text-red-300">
                {error}
              </p>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="h-11 w-full rounded-xl bg-slate-900 text-sm font-bold text-white shadow-sm transition-all hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Authenticating…
              </span>
            ) : (
              "Sign in to RegOps"
            )}
          </Button>
        </form>

        {/* Get Started link */}
        <p className="mt-5 text-center text-sm text-slate-500 dark:text-slate-400">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="font-semibold text-slate-800 underline-offset-2 hover:underline dark:text-slate-200"
          >
            Get started.
          </Link>
        </p>

        {/* Forgot password link */}
        <p className="mt-3 text-center text-sm text-slate-500 dark:text-slate-400">
          <Link
            href="/forgot-password"
            className="font-semibold text-slate-800 underline-offset-2 hover:underline dark:text-slate-200"
          >
            Forgot your password?
          </Link>
        </p>

        {/* Footer note */}
        <p className="mt-5 text-center text-xs leading-relaxed text-slate-400 dark:text-slate-600">
          Access is restricted to authorized personnel only.
          <br />
          Contact your system administrator if you need access.
        </p>

        {/* Back to landing */}
        <div className="mt-4 text-center">
          <Link
            href="/"
            className="text-xs text-slate-400 underline-offset-2 transition-colors hover:text-slate-600 hover:underline dark:text-slate-600 dark:hover:text-slate-400"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page export — split-screen layout with Suspense boundary.
// useSearchParams() inside AuthForm requires Suspense when used in a page.
// Without it Next.js cannot statically render the shell and the route fails.
// ---------------------------------------------------------------------------

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <BrandPanel />
      <Suspense
        fallback={
          <div className="flex w-full items-center justify-center bg-white dark:bg-slate-950 lg:w-[48%] xl:w-[45%]">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        }
      >
        <AuthForm />
      </Suspense>
    </div>
  );
}
