// omnis-ui/app/dashboard/team/page.tsx
// Team Management page — Server Component shell.
//
// Fetches current team members server-side and resolves the caller's role
// (to gate the invite/remove panel). Renders a client island for all
// interactive state.
//
// PERMISSION MODEL:
//   - admin      : full page — Invite Teammate + Remove User + Enterprise Code.
//   - qa_manager : sees the members table only; team management panels hidden.
//   - developer  : sees the members table only; team management panels hidden.
//   - viewer     : sees the members table only; team management panels hidden.

export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  ShieldCheck,
  Activity,
  ArrowLeft,
  Users,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { RoleBadge } from "@/components/role-badge";
import { SettingsMenu } from "@/components/settings-menu";
import { listTeamMembers } from "@/app/actions/team";
import { createClient } from "@/utils/supabase/server";
import { adminClient } from "@/utils/supabase/admin";
import { TeamClient } from "./team-client";

export default async function TeamPage() {
  // ── Resolve caller identity ──────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // DashboardLayout already gates unauthenticated users — belt-and-suspenders.
  if (!user) return null;

  // Resolve org_id + role for the permission gate
  const { data: profile } = await supabase
    .from("users")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  let callerRole: string | null = null;
  const orgId: string | null = profile?.org_id ?? null;

  if (orgId) {
    const { data: roleRow } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("org_id", orgId)
      .single();
    callerRole = roleRow?.role ?? null;
  }

  // ── Fetch team members ───────────────────────────────────────────────────
  const { members, error: membersError } = await listTeamMembers();

  // ── Permission gate — only admins get team management controls ──────────
  const isAdmin = callerRole === "admin";

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
              <p className="hidden sm:block text-xs text-zinc-400">Team</p>
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
          <Users className="h-5 w-5 text-zinc-500" strokeWidth={1.75} />
          <div>
            <h2 className="text-xl font-bold tracking-tight text-zinc-900">
              Team Management
            </h2>
            <p className="mt-0.5 text-sm text-zinc-400">
              View members and manage access to your organization
            </p>
          </div>
        </div>

        <Separator className="mb-8 bg-zinc-200" />

        {/* Delegate all interactive work (invite form, remove buttons, state)
            to a client island so this Server Component stays lean. */}
        <TeamClient
          initialMembers={members}
          membersError={membersError}
          isAdmin={isAdmin}
          currentUserId={user.id}
          orgId={orgId ?? ""}
        />
      </main>
    </div>
  );
}
