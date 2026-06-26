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

import { DashboardHeader } from "@/components/dashboard-header";
import { SetupClient } from "@/components/setup-client";
import { getSetupPageData } from "./actions";

export default async function SetupPage() {
  const { firstKey, logCount, error } = await getSetupPageData();

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* ── Header (matches dashboard/settings chrome) ─────────────────── */}
      <DashboardHeader
        subtitle="CLI Integration Setup"
        showRoleBadge={false}
        centerSlot={null}
        mobileBar={null}
      />

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
