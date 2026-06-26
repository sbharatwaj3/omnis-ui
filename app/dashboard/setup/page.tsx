// omnis-ui/app/dashboard/setup/page.tsx
// CLI Integration Setup — step-by-step onboarding flow for new organizations.
//
// React Server Component shell. Fetches initial API key and log count at
// request time, then delegates interactive polling and UI state to the
// <SetupClient> client island.
//
// Accessible at: /dashboard/setup
// Middleware gate: proxy.ts redirects here when org log count === 0.

export const dynamic = "force-dynamic";

import Link from "next/link";
import { ShieldCheck, Activity } from "lucide-react";
import { SettingsMenu } from "@/components/settings-menu";
import { SetupClient } from "@/components/setup-client";
import { getSetupPageData } from "./actions";

export default async function SetupPage() {
  const { firstKey, logCount, error } = await getSetupPageData();

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* ── Header (matches dashboard/settings chrome) ─────────────────── */}
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-screen-2xl w-full items-center px-6 py-4 md:px-8 md:py-5">
          {/* Left: logo */}
          <Link
            href="/dashboard"
            className="flex items-center gap-2 group shrink-0"
          >
            <ShieldCheck
              className="h-5 w-5 md:h-6 md:w-6 text-zinc-800"
              strokeWidth={1.75}
            />
            <div>
              <h1 className="text-base md:text-lg font-semibold tracking-tight text-zinc-900">
                Qavro
              </h1>
              <p className="hidden sm:block text-xs text-zinc-400">
                CLI Integration Setup
              </p>
            </div>
          </Link>

          {/* Right: compliance badge + settings menu */}
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <span className="hidden md:flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 select-none">
              <Activity className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs font-medium text-zinc-600">
                IEC 62304 · 21 CFR Part 11
              </span>
            </span>
            <SettingsMenu />
          </div>
        </div>
      </header>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-7xl w-full px-6 py-10 md:px-8 md:py-16">
        <SetupClient
          initialFirstKey={firstKey}
          initialLogCount={logCount}
          initError={error}
        />
      </main>
    </div>
  );
}
