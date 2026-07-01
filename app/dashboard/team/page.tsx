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

import { Users } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { DashboardHeader } from "@/components/dashboard-header";
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
      <DashboardHeader subtitle="Team" />

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-7xl w-full px-6 py-8 md:px-8 md:py-12">
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
