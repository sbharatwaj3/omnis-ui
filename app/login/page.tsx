"use client";
// omnis-ui/app/login/page.tsx
// Omnis RegOps authentication gateway.
// Client Component — calls Supabase auth from the browser.
// Styling matches the zinc/clinical design system used across the dashboard.

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ShieldCheck, AlertCircle, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("next") ?? "/";

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
      // Surface the error without leaking implementation details.
      // Common Supabase messages ("Invalid login credentials") are already
      // safe to show. We don't expand them further.
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Session established — router.refresh() flushes the Server Component
    // cache so the middleware sees the new session cookie immediately.
    router.refresh();
    router.push(redirectTo);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4">
      {/* Branding mark */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 shadow-lg">
          <ShieldCheck className="h-6 w-6 text-zinc-300" strokeWidth={1.5} />
        </div>
        <div className="text-center">
          <h1 className="text-lg font-semibold tracking-tight text-zinc-100">
            Omnis RegOps
          </h1>
          <p className="text-xs text-zinc-500">
            FDA Assurance Platform · Secure Access
          </p>
        </div>
      </div>

      {/* Login card */}
      <Card className="w-full max-w-sm border-zinc-800 bg-zinc-900 shadow-2xl">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold text-zinc-100">
            Sign in
          </CardTitle>
          <CardDescription className="text-xs text-zinc-500">
            IEC 62304 · 21 CFR Part 11 · Authenticated access only
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div className="space-y-1.5">
              <Label
                htmlFor="email"
                className="text-xs font-medium text-zinc-400"
              >
                Email address
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@organisation.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-zinc-500"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <Label
                htmlFor="password"
                className="text-xs font-medium text-zinc-400"
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
                className="border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-zinc-500"
              />
            </div>

            {/* Error banner */}
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2.5">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                <p className="text-xs leading-relaxed text-red-300">{error}</p>
              </div>
            )}

            {/* Submit */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-zinc-100 text-zinc-900 hover:bg-white disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Authenticating…
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Footer note */}
      <p className="mt-6 text-center text-xs text-zinc-600">
        Access is restricted to authorised personnel only.
        <br />
        Contact your system administrator if you need access.
      </p>
    </div>
  );
}
