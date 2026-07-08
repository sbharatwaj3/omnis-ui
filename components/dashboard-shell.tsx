// omnis-ui/components/dashboard-shell.tsx
// Command Center Shell — client wrapper for the AppSidebar + main content area.
//
// The layout.tsx (Server Component) cannot own useState, so this thin client
// component holds the mobile sidebar open/close toggle and renders:
//
//   ┌──────────────────────────────────────────────────────────┐
//   │  AppSidebar (w-64, sticky, desktop)  │  main content     │
//   │  ─ hidden on mobile unless toggled ─ │  flex-1, scroll   │
//   └──────────────────────────────────────────────────────────┘
//
// The TriageBadge is rendered here so it appears consistently on the right
// side of the top bar across all dashboard sub-routes.
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
    <div className="flex min-h-screen bg-zinc-50">
      {/* ── Persistent left sidebar ─────────────────────────────────────── */}
      <AppSidebar
        role={role}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* ── Main content area ────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar — hamburger + triage badge */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 lg:hidden">
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

          <TriageBadge count={pendingCount} role={role} />
        </div>

        {/* Desktop triage badge — absolute top-right, appears above page header */}
        <div className="hidden lg:block">
          <div className="absolute top-4 right-6 z-10">
            <TriageBadge count={pendingCount} role={role} />
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
