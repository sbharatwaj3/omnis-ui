// omnis-ui/app/dashboard/settings/page.tsx
// Settings page — account preferences and Developer API Keys.
//
// React Server Component shell. Fetches the user's active API keys at
// request time and passes them to the <DeveloperApiKeys> client island.
//
// LIGHT-MODE LOCK: This page contains no theme toggle, no Appearance section,
// and no `dark:` variants. The application is hardcoded to enterprise light.

export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  ShieldCheck,
  Activity,
  ArrowLeft,
  Settings,
  Code2,
} from "lucide-react";
import { SettingsMenu } from "@/components/settings-menu";
import { RoleBadge } from "@/components/role-badge";
import { DeveloperApiKeys } from "@/components/developer-api-keys";
import { Separator } from "@/components/ui/separator";
import { listApiKeys } from "@/app/dashboard/settings/actions";

export default async function SettingsPage() {
  // Fetch API keys server-side — key_hash is explicitly excluded in the action.
  const { keys } = await listApiKeys();

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center px-4 py-4 md:px-8 md:py-5">
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
                Omnis RegOps
              </h1>
              <p className="hidden sm:block text-xs text-zinc-400">Settings</p>
            </div>
          </Link>

          {/* Centre: back to dashboard */}
          <div className="hidden sm:flex flex-1 justify-center">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-4 py-1.5 text-sm font-semibold text-zinc-800 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Dashboard
            </Link>
          </div>

          {/* Right: IEC badge + role badge + settings menu */}
          <div className="flex items-center gap-2 ml-auto sm:ml-0 shrink-0">
            <span className="hidden md:flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 select-none">
              <Activity className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs font-medium text-zinc-600">
                IEC 62304 · 21 CFR Part 11
              </span>
            </span>
            <RoleBadge />
            <SettingsMenu />
          </div>
        </div>

        {/* Mobile-only sub-bar */}
        <div className="flex sm:hidden border-t border-zinc-100 px-4 py-2">
          <Link
            href="/dashboard"
            className="flex-1 text-center inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-100"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Dashboard
          </Link>
        </div>
      </header>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-3xl px-4 py-8 md:px-8 md:py-12">
        {/* Page title */}
        <div className="mb-8 flex items-center gap-3">
          <Settings className="h-5 w-5 text-zinc-500" strokeWidth={1.75} />
          <div>
            <h2 className="text-xl font-bold tracking-tight text-zinc-900">
              Settings
            </h2>
            <p className="mt-0.5 text-sm text-zinc-400">
              Manage your workspace preferences
            </p>
          </div>
        </div>

        <Separator className="mb-8 bg-zinc-200" />

        {/* ── Developer APIs section ─────────────────────────────────── */}
        <section aria-labelledby="developer-apis-heading" className="space-y-4">
          <div>
            <h3
              id="developer-apis-heading"
              className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-400"
            >
              <Code2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              Developer APIs
            </h3>
            <p className="mt-1.5 text-xs text-zinc-400">
              Manage organization API keys for authenticating external CI/CD
              pipeline integrations. Keys are hashed with SHA-256 at rest and
              shown only once at creation time.
            </p>
          </div>

          {/* DeveloperApiKeys is a "use client" island that handles all
              interactive state: modal, generation, revoke, copy. */}
          <DeveloperApiKeys initialKeys={keys} />
        </section>
      </main>
    </div>
  );
}
