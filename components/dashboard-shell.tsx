// omnis-ui/components/dashboard-shell.tsx
// Command Center Shell — client wrapper for the AppSidebar + main content area.
//
// The layout.tsx (Server Component) cannot own useState, so this thin client
// component holds the mobile sidebar open/close toggle and composes:
//
//   ┌────────────────────────────────────────────────────────────┐
//   │  AppSidebar (w-64, sticky, lg+)  │  main content (flex-1) │
//   │  ─ mobile: animated overlay ──── │  overflow-y-auto       │
//   └────────────────────────────────────────────────────────────┘
//
// Settings gear and role badge live in the sidebar footer on desktop.
// On mobile, the top bar provides a hamburger + QAVRO label + triage badge.
// The desktop TriageBadge is injected separately into the page's own header
// bar — not as an absolute overlay — to stay within the normal flow.
"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { TriageBadge } from "@/components/triage-badge";

interface DashboardShellProps {
  children: React.ReactNode;
  role: string;
  pendingCount: number;
}

export function DashboardShell({
  children,
  role,
  pendingCount,
}: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    // h-screen + overflow-hidden = viewport locked. The sidebar is always
    // visible. Scrolling happens exclusively inside <main>, never the shell.
    <div className="flex h-screen w-full overflow-hidden bg-zinc-50">
      {/* ── Persistent left sidebar — never shrinks ──────────────────────── */}
      <AppSidebar
        role={role}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* ── Main content column — fills remaining width, never overflows ─── */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* ── Mobile-only top bar (hamburger + logo + triage badge) ───────── */}
        {/* On desktop (lg+) this bar is hidden; the sidebar handles identity. */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 lg:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="flex h-8 w-8 items-center justify-center rounded border border-zinc-200 bg-white text-zinc-600 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          >
            <Menu className="h-4 w-4" />
          </button>

          <span className="text-sm font-semibold tracking-tight text-zinc-900">
            QAVRO
          </span>

          {/* Triage badge — mobile only here; desktop version is in page header */}
          <TriageBadge count={pendingCount} role={role} />
        </div>

        {/* Page content — this is the ONLY scrollable region in the app.
            min-h-0 forces the flex child to respect the parent height
            instead of pushing outward when content expands (e.g. expanded
            evidence log rows). */}
        <main className="flex-1 overflow-y-auto min-h-0">
          {children}
        </main>
      </div>
    </div>
  );
}
