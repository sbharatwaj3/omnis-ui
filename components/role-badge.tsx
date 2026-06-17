"use client";
// omnis-ui/components/role-badge.tsx
// Pill-style Role Badge for the dashboard navigation bar.
//
// Visually distinct styling per role:
//   qa_manager : Solid emerald fill — full access, prominent treatment.
//   developer  : Solid blue fill   — write-access, clearly differentiated.
//   viewer     : Neutral slate fill — read-only, muted to signal limited access.
//
// Includes a tooltip-style title attribute explaining access level.
// Renders null while loading to prevent layout shift.

import { useUserRole, type UserRole } from "@/hooks/useUserRole";
import { ShieldCheck, Code2, Eye } from "lucide-react";

const ROLE_CONFIG: Record<
  NonNullable<UserRole>,
  {
    label: string;
    tooltip: string;
    className: string;
    Icon: React.ElementType;
  }
> = {
  qa_manager: {
    label: "QA Manager",
    tooltip: "Role: QA Manager (Full Access — approve logs, manage settings)",
    className:
      "bg-emerald-600 text-white border-emerald-700 dark:bg-emerald-500 dark:border-emerald-600",
    Icon: ShieldCheck,
  },
  developer: {
    label: "Developer",
    tooltip: "Role: Developer (Ingest logs, view metrics)",
    className:
      "bg-blue-600 text-white border-blue-700 dark:bg-blue-500 dark:border-blue-600",
    Icon: Code2,
  },
  viewer: {
    label: "Viewer",
    tooltip: "Role: Viewer (Read-Only access to dashboard)",
    className:
      "bg-slate-500 text-white border-slate-600 dark:bg-slate-600 dark:border-slate-700",
    Icon: Eye,
  },
};

export function RoleBadge() {
  const { role, loading } = useUserRole();

  if (loading || !role) return null;

  const config = ROLE_CONFIG[role];
  const { label, tooltip, className, Icon } = config;

  return (
    <span
      title={tooltip}
      aria-label={tooltip}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold select-none cursor-default ${className}`}
    >
      <Icon className="h-3 w-3 shrink-0" strokeWidth={2} />
      {label}
    </span>
  );
}
