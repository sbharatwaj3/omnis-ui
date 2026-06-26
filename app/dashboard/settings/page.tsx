// omnis-ui/app/dashboard/settings/page.tsx
// Settings page — account preferences and Developer API Keys.
//
// React Server Component shell. Fetches the user's active API keys at
// request time and passes them to the <DeveloperApiKeys> client island.
//
// LIGHT-MODE LOCK: This page contains no theme toggle, no Appearance section,
// and no `dark:` variants. The application is hardcoded to enterprise light.

export const dynamic = "force-dynamic";

import { Settings, Code2 } from "lucide-react";
import { DashboardHeader } from "@/components/dashboard-header";
import { DeveloperApiKeys } from "@/components/developer-api-keys";
import { Separator } from "@/components/ui/separator";
import { listApiKeys } from "@/app/dashboard/settings/actions";

export default async function SettingsPage() {
  // Fetch API keys server-side — key_hash is explicitly excluded in the action.
  const { keys } = await listApiKeys();

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <DashboardHeader subtitle="Settings" />

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-7xl w-full px-6 py-8 md:px-8 md:py-12">
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
