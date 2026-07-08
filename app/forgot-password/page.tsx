"use client";
// omnis-ui/app/forgot-password/page.tsx
// Omnis RegOps — Forgot Password
//
// Presents a simple form that calls supabase.auth.resetPasswordForEmail().
// Supabase sends a password-reset link to the provided email address.
// The link redirects to /reset-password (configurable in Supabase Auth settings).
//
// Design matches the login/signup split-screen layout for visual consistency.

import { useState } from "react";
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
  ArrowLeft,
  Mail,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ---------------------------------------------------------------------------
// Animation variants — institutional, zero bounce (MedTech mandate)
// ---------------------------------------------------------------------------

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: "easeOut" as const },
  },
};

const errorVariants = {
  hidden: { opacity: 0, height: 0 },
  visible: {
    opacity: 1,
    height: "auto",
    transition: { duration: 0.2, ease: "easeOut" as const },
  },
  exit: {
    opacity: 0,
    height: 0,
    transition: { duration: 0.15, ease: "easeIn" as const },
  },
};

const successVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: "easeOut" as const },
  },
};

// ---------------------------------------------------------------------------
// Left branding panel
// ---------------------------------------------------------------------------

function BrandPanel() {
  return (
    <div className="hidden lg:flex lg:w-[52%] xl:w-[55%] flex-col justify-between bg-slate-900 px-12 py-12">
      <Link href="/" className="flex items-center gap-3 group">
        <div className="flex h-9 w-9 items-center justify-center rounded bg-emerald-500/10 ring-1 ring-emerald-500/30 group-hover:ring-emerald-400 transition-all duration-200">
          <ShieldCheck className="h-5 w-5 text-emerald-400" strokeWidth={1.75} />
        </div>
        <div className="leading-none">
          <span className="block text-sm font-medium text-slate-100">Qavro</span>
          <span className="block text-[10px] font-semibold uppercase tracking-widest text-emerald-400">FDA Assurance Platform</span>
        </div>
      </Link>

      <div className="max-w-md">
        <div className="mb-4 inline-flex items-center gap-2 rounded border border-emerald-800 bg-emerald-950/60 px-3 py-1">
          <span className="h-1.5 w-1.5 rounded bg-emerald-400 animate-pulse" />
          <span className="text-xs font-semibold text-emerald-300">Account Recovery</span>
        </div>
        <h1 className="text-3xl font-semibold leading-tight tracking-tight text-white xl:text-4xl">
          Reset Your<br />
          <span className="text-emerald-400">Password Securely.</span>
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-slate-400">
          Enter the email address associated with your compliance workspace. A secure reset link will be sent to your inbox.
        </p>
        <div className="mt-8 flex items-start gap-3">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-800 ring-1 ring-slate-700">
            <Mail className="h-3.5 w-3.5 text-emerald-400" strokeWidth={1.75} />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-200">Password Reset Link</p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
              The link expires after 1 hour for security. If you don&apos;t receive it, check your spam folder.
            </p>
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-600">
        © 2026 Qavro. Access restricted to authorized personnel only.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reset form
// ---------------------------------------------------------------------------

function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);

    const supabase = createClient();

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      trimmedEmail,
      {
        // Redirect to the password update page after clicking the link.
        // This must also be configured as an allowed redirect URL in the
        // Supabase Auth dashboard under "URL Configuration ? Redirect URLs".
        redirectTo: `${window.location.origin}/update-password`,
      },
    );

    setLoading(false);

    if (resetError) {
      // Do not reveal whether the email is registered — surface a generic error.
      console.error("[forgot-password] Reset error:", resetError.message);
      setError("Something went wrong. Please try again in a moment.");
      return;
    }

    // Always show success — avoids email enumeration.
    setSent(true);
  }

  // -- Success state ---------------------------------------------------------
  if (sent) {
    return (
      <div className="flex w-full flex-col items-center justify-center px-6 py-12 lg:w-[48%] xl:w-[45%] bg-white">
        <motion.div
          className="w-full max-w-sm text-center"
          variants={successVariants}
          initial="hidden"
          animate="visible"
        >
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded bg-emerald-50 ring-1 ring-emerald-200">
            <CheckCircle2 className="h-7 w-7 text-emerald-500" strokeWidth={1.75} />
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">Check your email</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            If an account exists for{" "}
            <span className="font-semibold text-slate-700">{email.trim()}</span>,
            we&apos;ve sent a password reset link. It expires in 1 hour.
          </p>
          <p className="mt-6 text-xs text-slate-400">
            Remembered your password?{" "}
            <Link href="/login" className="font-semibold text-slate-700 underline-offset-2 hover:underline">
              Sign in
            </Link>
          </p>
        </motion.div>
      </div>
    );
  }

  // -- Main form --------------------------------------------------------------
  return (
    <div className="flex w-full flex-col items-center justify-center px-6 py-12 lg:w-[48%] xl:w-[45%] bg-white">
      {/* Mobile logo */}
      <Link href="/" className="mb-8 flex flex-col items-center gap-3 lg:hidden group">
        <div className="flex h-12 w-12 items-center justify-center rounded bg-slate-900 group-hover:ring-2 group-hover:ring-emerald-400 transition-all">
          <ShieldCheck className="h-6 w-6 text-emerald-400" strokeWidth={1.75} />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-slate-900">Qavro</p>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600">FDA Assurance Platform</p>
        </div>
      </Link>

      {/* Animated card mount */}
      <motion.div
        className="w-full max-w-sm"
        variants={cardVariants}
        initial="hidden"
        animate="visible"
      >
        <div className="mb-7">
          <h2 className="text-2xl font-medium tracking-tight text-slate-900">Forgot password?</h2>
          <p className="mt-1.5 text-sm text-slate-500">
            Enter your email and we&apos;ll send you a reset link.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Email address
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@organization.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (error) setError(null); }}
              disabled={loading}
              className="h-11 border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:ring-emerald-500"
            />
          </div>

          {/* Animated error banner */}
          <AnimatePresence>
            {error && (
              <motion.div
                key="forgot-error"
                variants={errorVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="overflow-hidden"
              >
                <div className="flex items-start gap-2.5 rounded border border-red-200 bg-red-50 px-3.5 py-3">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                  <p className="text-xs leading-relaxed text-red-700">{error}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <Button
            type="submit"
            disabled={loading}
            className="h-11 w-full rounded bg-slate-900 text-sm font-medium text-white transition-all hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Sending reset link…</span>
            ) : (
              "Send Reset Link"
            )}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          <Link href="/login" className="inline-flex items-center gap-1 font-semibold text-slate-800 underline-offset-2 hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </Link>
        </p>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page export
// ---------------------------------------------------------------------------

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <BrandPanel />
      <ForgotPasswordForm />
    </div>
  );
}
