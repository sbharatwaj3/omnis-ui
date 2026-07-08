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
import { SubpageHeader } from "@/components/subpage-header";
import { SettingsAnimatedShell, SettingsAnimatedItem } from "@/components/settings-animated-shell";
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
    <div className="flex flex-col min-h-full bg-zinc-50">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <SubpageHeader
        title="Team Management"
        subtitle="Members · Access Control"
        complianceText="IEC 62304 · 21 CFR Part 11"
      />

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <div className="w-full px-8 py-8">
        <SettingsAnimatedShell>
          {/* Page title */}
          <SettingsAnimatedItem>
            <div className="mb-8 flex items-center gap-3">
              <Users className="h-5 w-5 text-zinc-500" strokeWidth={1.75} />
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-zinc-900">
                  Team Management
                </h2>
                <p className="mt-0.5 text-sm text-zinc-400">
                  View members and manage access to your organization
                </p>
              </div>
            </div>
          </SettingsAnimatedItem>

          <SettingsAnimatedItem>
            <Separator className="mb-8 bg-zinc-200" />
          </SettingsAnimatedItem>

          {/* Delegate all interactive work (invite form, remove buttons, state)
              to a client island so this Server Component stays lean. */}
          <SettingsAnimatedItem>
            <TeamClient
              initialMembers={members}
              membersError={membersError}
              isAdmin={isAdmin}
              currentUserId={user.id}
              orgId={orgId ?? ""}
            />
          </SettingsAnimatedItem>
        </SettingsAnimatedShell>
      </div>
    </div>
  );
}
