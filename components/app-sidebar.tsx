// omnis-ui/components/app-sidebar.tsx
// Persistent left-hand navigation sidebar — Command Center architecture.
//
// Renders the QAVRO logo at the top and the four primary navigation links
// that previously lived as top-of-page card links on the dashboard hub.
//
// Mobile: hidden by default (translate-x-full). A toggle state passed from
// the parent shell reveals it as a full-height overlay panel.
// Desktop (lg+): always visible, fixed width w-64.
//
// DESIGN SYSTEM:
//   - Flat elevation only. No box-shadows.
//   - border-r border-zinc-200 separates sidebar from content.
//   - bg-zinc-50 (Level 1 surface) matches the card surface.
//   - Active link: bg-zinc-100 border-l-2 border-zinc-900.
//   - No border-radius > 4px anywhere.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  Table2,
  ClipboardList,
  Brain,
  BarChart2,
  X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Nav item definition
// ---------------------------------------------------------------------------

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  description: string;
  /** If true, only render when the caller indicates admin role. */
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Compliance Matrix",
    href: "/readiness",
    icon: Table2,
    description: "Traceability reports",
  },
  {
    label: "Requirements",
    href: "/dashboard/requirements",
    icon: ClipboardList,
    description: "SRS/SDS mapping",
  },
  {
    label: "Triage Inbox",
    href: "/dashboard/triage",
    icon: Brain,
    description: "AI-flagged discrepancies",
  },
  {
    label: "Token Usage",
    href: "/dashboard/usage",
    icon: BarChart2,
    description: "AI token consumption",
    adminOnly: true,
  },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AppSidebarProps {
  /** Current user role — used to gate admin-only nav items. */
  role?: string | null;
  /** Mobile overlay open state (managed by parent shell). */
  mobileOpen?: boolean;
  /** Callback to close the mobile overlay. */
  onMobileClose?: () => void;
}

// ---------------------------------------------------------------------------
// Sidebar inner content (shared between desktop and mobile overlay)
// ---------------------------------------------------------------------------

function SidebarContent({
  role,
  onMobileClose,
}: {
  role?: string | null;
  onMobileClose?: () => void;
}) {
  const pathname = usePathname();

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.adminOnly || role === "admin",
  );

  return (
    <div className="flex h-full flex-col">
      {/* ── Logo ─────────────────────────────────────────────────────────── */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 px-5">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          onClick={onMobileClose}
        >
          <ShieldCheck
            className="h-5 w-5 text-zinc-800"
            strokeWidth={1.75}
          />
          <div>
            <span className="text-sm font-semibold tracking-tight text-zinc-900">
              QAVRO
            </span>
            <p className="text-[10px] leading-none text-zinc-400">
              FDA Assurance
            </p>
          </div>
        </Link>

        {/* Mobile close button */}
        {onMobileClose && (
          <button
            onClick={onMobileClose}
            aria-label="Close navigation"
            className="flex h-7 w-7 items-center justify-center rounded border border-zinc-200 bg-white text-zinc-500 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 lg:hidden"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ── Section label ────────────────────────────────────────────────── */}
      <div className="px-5 pb-1 pt-5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
          Navigation
        </p>
      </div>

      {/* ── Nav links ────────────────────────────────────────────────────── */}
      <nav className="flex flex-col gap-0.5 px-3" aria-label="Primary navigation">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          // Active: exact match or starts-with for nested routes.
          // /readiness is top-level, so we use exact match there.
          const isActive =
            item.href === "/readiness"
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onMobileClose}
              aria-current={isActive ? "page" : undefined}
              className={[
                // Layout
                "group flex items-center gap-3 rounded px-3 py-2.5 text-sm transition-colors",
                // Focus ring
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400",
                // Active vs idle states
                isActive
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
              ].join(" ")}
            >
              <Icon
                className={[
                  "h-4 w-4 shrink-0 transition-colors",
                  isActive ? "text-white" : "text-zinc-400 group-hover:text-zinc-600",
                ].join(" ")}
                strokeWidth={1.75}
              />
              <div className="min-w-0">
                <span className="block font-medium leading-none">
                  {item.label}
                </span>
                <span
                  className={[
                    "mt-0.5 block text-[11px] leading-none truncate",
                    isActive ? "text-zinc-300" : "text-zinc-400",
                  ].join(" ")}
                >
                  {item.description}
                </span>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* ── Spacer + footer ──────────────────────────────────────────────── */}
      <div className="mt-auto border-t border-zinc-200 px-5 py-4">
        <p className="text-[10px] text-zinc-400">
          IEC 62304 · 21 CFR Part 11
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AppSidebar — exported component
// ---------------------------------------------------------------------------

export function AppSidebar({
  role,
  mobileOpen = false,
  onMobileClose,
}: AppSidebarProps) {
  return (
    <>
      {/* ── Desktop sidebar (lg+) — always visible ─────────────────────── */}
      <aside
        className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 h-screen sticky top-0 border-r border-zinc-200 bg-zinc-50 overflow-y-auto"
        aria-label="Application sidebar"
      >
        <SidebarContent role={role} />
      </aside>

      {/* ── Mobile overlay ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="sidebar-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: "tween", ease: "easeOut", duration: 0.15 }}
              className="fixed inset-0 z-40 bg-zinc-900/40 lg:hidden"
              onClick={onMobileClose}
              aria-hidden="true"
            />

            {/* Drawer panel */}
            <motion.div
              key="sidebar-panel"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-y-0 left-0 z-50 w-64 border-r border-zinc-200 bg-zinc-50 lg:hidden"
              aria-label="Mobile navigation"
            >
              <SidebarContent role={role} onMobileClose={onMobileClose} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
