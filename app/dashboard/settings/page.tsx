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
import { SubpageHeader } from "@/components/subpage-header";
import { DeveloperApiKeys } from "@/components/developer-api-keys";
import { Separator } from "@/components/ui/separator";
import { SettingsAnimatedShell, SettingsAnimatedItem } from "@/components/settings-animated-shell";
import { listApiKeys } from "@/app/dashboard/settings/actions";

export default async function SettingsPage() {
  // Fetch API keys server-side — key_hash is explicitly excluded in the action.
  const { keys } = await listApiKeys();

  return (
    <div className="flex flex-col min-h-full bg-zinc-50">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <SubpageHeader
        title="Settings"
        subtitle="API Keys · Workspace Preferences"
        complianceText="IEC 62304 · 21 CFR Part 11"
      />

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <div className="w-full px-8 py-8">
        <SettingsAnimatedShell>
          {/* Page title */}
          <SettingsAnimatedItem>
            <div className="mb-8 flex items-center gap-3">
              <Settings className="h-5 w-5 text-zinc-500" strokeWidth={1.75} />
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-zinc-900">
                  Settings
                </h2>
                <p className="mt-0.5 text-sm text-zinc-400">
                  Manage your workspace preferences
                </p>
              </div>
            </div>
          </SettingsAnimatedItem>

          <SettingsAnimatedItem>
            <Separator className="mb-8 bg-zinc-200" />
          </SettingsAnimatedItem>

          {/* ── Developer APIs section ─────────────────────────────────── */}
          <SettingsAnimatedItem>
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
          </SettingsAnimatedItem>
        </SettingsAnimatedShell>
      </div>
    </div>
  );
}
