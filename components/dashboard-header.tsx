// omnis-ui/components/dashboard-header.tsx
// Shared Dashboard Header — strict CSS Grid layout for guaranteed centre symmetry.
//
// ARCHITECTURAL FIX (replaces flexbox `flex-1 justify-center`):
//   Standard flexbox cannot guarantee that a middle element is at the visual
//   centre of the viewport when its left and right siblings have unequal
//   intrinsic widths — `flex-1` distributes leftover space, so any asymmetry
//   in the flanking siblings shifts the centre element off the page mid-line.
//
//   This header uses a 3-column CSS Grid (`grid grid-cols-3`) which divides
//   the header into THREE FIXED, EQUAL columns regardless of content width:
//
//     ┌──────── 33.3% ────────┬──────── 33.3% ────────┬──────── 33.3% ────────┐
//     │ Logo (justify-start)  │ Centre slot (centre)  │ Right cluster (end)   │
//     └───────────────────────┴───────────────────────┴───────────────────────┘
//
//   Because the middle column spans 33.3%→66.7% of the container width,
//   `justify-self-center` inside it places the centre slot exactly at the
//   50% mark — the geometric centre of the header — regardless of the
//   widths of the logo or right cluster.
//
// This component consolidates the header that was previously duplicated and
// drifting across ~11 spoke pages (settings, team, audit-logs, integration,
// requirements, usage, triage, setup, readiness, logs/[id], dashboard hub).

import Link from "next/link";
import { ShieldCheck, Activity, Settings } from "lucide-react";
import { RoleBadge } from "@/components/role-badge";
import { SettingsMenu } from "@/components/settings-menu";

export interface DashboardHeaderProps {
  /** Sub-title shown beneath "Qavro" (hidden on mobile). */
  subtitle: string;
  /** Where the "Back to Dashboard" pill (and mobile sub-bar) navigates. Default `/dashboard`. */
  backHref?: string;
  /** Right-side compliance badge text. Default `"IEC 62304 · 21 CFR Part 11"`. */
  complianceText?: string;
  /** Render the `<RoleBadge />` in the right cluster. Default `true`. */
  showRoleBadge?: boolean;
  /** `"menu"` (default) renders the interactive dropdown; `"link"` renders a static Settings link. */
  settingsVariant?: "menu" | "link";
  /** When `false`, renders the logo as a non-interactive div. Default `true`. */
  logoAsLink?: boolean;
  /**
   * Replace the default "Back to Dashboard" pill in the centre column.
   * Omit (or leave `undefined`) to use the default pill.
   * Pass `null` to render nothing in the centre.
   */
  centerSlot?: React.ReactNode;
  /**
   * Replace the default mobile sub-bar (full-width pill below the header).
   * Omit to use the default Back-to-Dashboard sub-bar.
   * Pass `null` to omit the sub-bar entirely.
   */
  mobileBar?: React.ReactNode;
}

export function DashboardHeader({
  subtitle,
  backHref = "/dashboard",
  complianceText = "IEC 62304 · 21 CFR Part 11",
  showRoleBadge = true,
  settingsVariant = "menu",
  logoAsLink = true,
  centerSlot,
  mobileBar,
}: DashboardHeaderProps) {
  // ── Default centre slot: the "Back to Dashboard" pill ────────────────────
  const resolvedCenter =
    centerSlot === undefined ? (
      <Link
        href={backHref}
        className="inline-flex items-center rounded border border-zinc-200 bg-white px-4 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900"
      >
        Back to Dashboard
      </Link>
    ) : (
      centerSlot
    );

  // ── Default mobile sub-bar: full-width Back-to-Dashboard pill ────────────
  const resolvedMobileBar =
    mobileBar === undefined ? (
      <Link
        href={backHref}
        className="flex-1 text-center rounded border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100"
      >
        Back to Dashboard
      </Link>
    ) : (
      mobileBar
    );

  // ── Logo content (reused by Link and non-Link variants) ─────────────────
  const logoInner = (
    <>
      <ShieldCheck
        className="h-5 w-5 md:h-6 md:w-6 text-zinc-800"
        strokeWidth={1.75}
      />
      <div>
        <h1 className="text-base md:text-lg font-semibold tracking-tight text-zinc-900">
          Qavro
        </h1>
        <p className="hidden sm:block text-xs text-zinc-400">{subtitle}</p>
      </div>
    </>
  );

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto max-w-screen-2xl w-full px-6 py-4 md:px-8 md:py-5">
        {/* Strict 3-column CSS Grid — middle column is geometrically centred
            in the container, so `justify-self-center` produces a pill that
            sits at the exact viewport mid-line regardless of logo or
            right-cluster widths. */}
        <div className="grid grid-cols-3 items-center w-full gap-x-4">
          {/* ── Column 1 (left): logo ─────────────────────────────────── */}
          <div className="justify-self-start min-w-0">
            {logoAsLink ? (
              <Link
                href="/dashboard"
                className="flex items-center gap-2 group shrink-0"
              >
                {logoInner}
              </Link>
            ) : (
              <div className="flex items-center gap-2 shrink-0">
                {logoInner}
              </div>
            )}
          </div>

          {/* ── Column 2 (centre): Back-to-Dashboard pill (or override) ── */}
          {/* Hidden on mobile; the mobile sub-bar handles small viewports. */}
          <div className="hidden sm:flex justify-self-center items-center">
            {resolvedCenter}
          </div>

          {/* ── Column 3 (right): compliance + role + settings ──────────── */}
          <div className="justify-self-end flex items-center gap-x-2">
            <span className="hidden md:flex items-center gap-2 rounded border border-zinc-200 bg-zinc-50 px-3 py-1.5 select-none">
              <Activity className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs font-medium text-zinc-600">
                {complianceText}
              </span>
            </span>
            {showRoleBadge ? <RoleBadge /> : null}
            {settingsVariant === "menu" ? (
              <SettingsMenu />
            ) : (
              <Link
                href="/dashboard/settings"
                aria-label="Settings"
                className="flex h-8 w-8 items-center justify-center rounded border border-zinc-200 bg-white text-zinc-500 transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
              >
                <Settings className="h-4 w-4" strokeWidth={1.75} />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── Mobile-only sub-bar (full-width pill below the header) ─────── */}
      {resolvedMobileBar ? (
        <div className="flex sm:hidden border-t border-zinc-100 px-4 py-2 gap-2">
          {resolvedMobileBar}
        </div>
      ) : null}
    </header>
  );
}
