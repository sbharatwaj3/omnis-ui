"use client";
// omnis-ui/app/update-password/page.tsx
// Omnis RegOps — Password Reset Completion
//
// This page is reached when the user clicks the reset link in their email.
// Supabase establishes a session via the URL hash/token before this page loads.
// The user provides a new password; we call supabase.auth.updateUser() to save
// it, then redirect to /login.
//
// Design: matches the forgot-password split-screen layout for visual consistency.

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Lock,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Left branding panel
// ---------------------------------------------------------------------------

function BrandPanel() {
  return (
    <div className="hidden lg:flex lg:w-[52%] xl:w-[55%] flex-col justify-between bg-slate-900 px-12 py-12 dark:bg-slate-950">
      <Link href="/" className="flex items-center gap-3 group">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30 group-hover:ring-emerald-400 transition-all duration-200">
          <ShieldCheck className="h-5 w-5 text-emerald-400" strokeWidth={1.75} />
        </div>
        <div className="leading-none">
          <span className="block text-sm font-bold text-slate-100">Omnis MedTech Corp</span>
          <span className="block text-[10px] font-semibold uppercase tracking-widest text-emerald-400">RegOps Platform</span>
        </div>
      </Link>

      <div className="max-w-md">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-800 bg-emerald-950/60 px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-semibold text-emerald-300">Account Recovery</span>
        </div>
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-white xl:text-4xl">
          Set Your New<br />
          <span className="text-emerald-400">Password.</span>
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-slate-400">
          Choose a strong password for your compliance workspace. Your new
          password will be active immediately after saving.
        </p>
        <div className="mt-8 flex items-start gap-3">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 ring-1 ring-slate-700">
            <Lock className="h-3.5 w-3.5 text-emerald-400" strokeWidth={1.75} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-200">Zero-Trust Password Update</p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
              Your reset token is single-use and expires after one hour. This
              action is recorded in the immutable audit ledger.
            </p>
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-600">
        © 2026 Omnis MedTech Corp. Access restricted to authorized personnel only.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Update Password form
// ---------------------------------------------------------------------------

function UpdatePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  // Track whether Supabase has established a session from the reset token.
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    // Supabase SSR fires an INITIAL_SESSION or PASSWORD_RECOVERY event once
    // the URL token has been exchanged for a session. We listen for it to
    // confirm the reset link is valid before showing the form.
    const supabase = createClient();

    // Check for an existing session first (token may already be exchanged).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setSessionReady(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (updateError) {
      console.error("[update-password] updateUser error:", updateError.message);
      setError(updateError.message ?? "Failed to update password. Please try again.");
      return;
    }

    // Password updated successfully — sign out and send to login.
    await supabase.auth.signOut();
    setSuccess(true);
    setTimeout(() => router.push("/login"), 2500);
  }

  // ── Success state ─────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="flex w-full flex-col items-center justify-center px-6 py-12 lg:w-[48%] xl:w-[45%] bg-white dark:bg-slate-950">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:ring-emerald-800">
            <CheckCircle2 className="h-7 w-7 text-emerald-500" strokeWidth={1.75} />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Password updated</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            Your password has been changed successfully. Redirecting you to sign in…
          </p>
          <Link
            href="/login"
            className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-slate-700 underline-offset-2 hover:underline dark:text-slate-300"
          >
            Go to Sign In
          </Link>
        </div>
      </div>
    );
  }

  // ── Session not yet established (token exchange in progress) ──────────────
  if (!sessionReady) {
    return (
      <div className="flex w-full flex-col items-center justify-center px-6 py-12 lg:w-[48%] xl:w-[45%] bg-white dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Verifying your reset link…</p>
        </div>
      </div>
    );
  }

  // ── Main form ──────────────────────────────────────────────────────────────
  return (
    <div className="flex w-full flex-col items-center justify-center px-6 py-12 lg:w-[48%] xl:w-[45%] bg-white dark:bg-slate-950">
      {/* Mobile logo */}
      <Link href="/" className="mb-8 flex flex-col items-center gap-3 lg:hidden group">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 shadow-lg group-hover:ring-2 group-hover:ring-emerald-400 transition-all dark:bg-slate-800">
          <ShieldCheck className="h-6 w-6 text-emerald-400" strokeWidth={1.75} />
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Omnis MedTech Corp</p>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">RegOps Platform</p>
        </div>
      </Link>

      <div className="w-full max-w-sm">
        <div className="mb-7">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Set new password</h2>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            Choose a strong password of at least 8 characters.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              New Password
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (error) setError(null); }}
              disabled={loading}
              className="h-11 border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-600"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-password" className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Confirm New Password
            </Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              placeholder="Re-enter your new password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); if (error) setError(null); }}
              disabled={loading}
              className="h-11 border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-600"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 dark:border-red-900/60 dark:bg-red-950/40">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500 dark:text-red-400" />
              <p className="text-xs leading-relaxed text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="h-11 w-full rounded-xl bg-slate-900 text-sm font-bold text-white shadow-sm transition-all hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            {loading ? (
              <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Saving…</span>
            ) : (
              "Save New Password"
            )}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Remember your password?{" "}
          <Link href="/login" className="font-semibold text-slate-800 underline-offset-2 hover:underline dark:text-slate-200">
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

export default function UpdatePasswordPage() {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <BrandPanel />
      <UpdatePasswordForm />
    </div>
  );
}
