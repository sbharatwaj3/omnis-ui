"use server";
// omnis-ui/app/actions/team.ts
// Team Management Server Actions — invite teammates and list org members.
//
// CONSTITUTION LAW II:
//   - Session verified server-side on every invocation. No auth bypass.
//   - org_id is resolved from the verified session, never trusted from the client.
//   - All secrets loaded via process.env; nothing is hardcoded.
//
// SECURITY MODEL:
//   - Only qa_managers may invite new users (enforced server-side).
//     Sending the form from the client as a different role returns an error.
//   - The Supabase Auth Admin API sends the invite email and creates the
//     auth.users row. The deferred-profile trigger (migration
//     20260613192613) will create the public.users row on first sign-in.
//   - We pre-insert the user_roles row using the invitee's auth user_id
//     (returned by inviteUserByEmail) so their role is available the moment
//     they complete sign-up. We also update public.users with the org_id
//     immediately if the row already exists (edge case: existing Supabase user).
//
// INVITE FLOW:
//   1. Verify caller session and resolve their org_id + role.
//   2. Reject if caller is not qa_manager.
//   3. Validate email and role input.
//   4. Call auth.admin.inviteUserByEmail — Supabase sends the magic-link email.
//      The `data.options.data` payload seeds the raw_user_meta_data which the
//      deferred-profile trigger reads to assign org_id on sign-up.
//   5. Pre-insert a user_roles row so the role is applied at first login.
//   6. Upsert public.users with org_id in case the user already exists in auth.

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { adminClient } from "@/utils/supabase/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InviteRole = "qa_manager" | "developer" | "viewer";

export interface TeamMember {
  user_id: string;
  developer_email: string;
  role: InviteRole | null;
  joined_at: string; // ISO timestamp from users row or user_roles.assigned_at
}

export interface InviteResult {
  success: boolean;
  error?: string;
}

export interface ListMembersResult {
  members: TeamMember[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Helper: resolve session org_id and role
// ---------------------------------------------------------------------------

async function resolveCallerContext(): Promise<{
  userId: string;
  orgId: string;
  role: string | null;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return null;

  // Resolve org_id from the users table (session-verified, never client-supplied)
  const { data: profile } = await supabase
    .from("users")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile?.org_id) return null;

  const orgId: string = profile.org_id;

  // Resolve role via user_roles
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .single();

  return {
    userId: user.id,
    orgId,
    role: roleRow?.role ?? null,
  };
}

// ---------------------------------------------------------------------------
// Action: inviteTeamMember
// ---------------------------------------------------------------------------
// Sends a Supabase Auth invite email and pre-assigns the org + role so the
// invitee lands in the correct workspace on first sign-in.
// PERMISSION GATE: qa_manager only.
// ---------------------------------------------------------------------------

export async function inviteTeamMember(
  formData: FormData,
): Promise<InviteResult> {
  // Step 1: Resolve caller context (session + org + role).
  const ctx = await resolveCallerContext();
  if (!ctx) {
    return { success: false, error: "Unauthorised: valid session required." };
  }

  // Step 2: Enforce RBAC — only QA Managers may send invites.
  if (ctx.role !== "qa_manager") {
    return {
      success: false,
      error: "Permission denied: only QA Managers can invite team members.",
    };
  }

  // Step 3: Validate inputs.
  const email = (formData.get("email") as string | null)?.trim().toLowerCase();
  const selectedRole = (formData.get("role") as string | null)?.trim() as InviteRole | null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: "A valid email address is required." };
  }

  const validRoles: InviteRole[] = ["qa_manager", "developer", "viewer"];
  if (!selectedRole || !validRoles.includes(selectedRole)) {
    return { success: false, error: "Please select a valid role." };
  }

  // Step 4: Send the Supabase Auth invite.
  // The `data` payload seeds raw_user_meta_data. The updated handle_new_user()
  // trigger (migration 20260617180000) reads org_id, public_key, and role from
  // this metadata so that the invited user's profile row is fully resolved at
  // first login — no trip to /onboarding required for invited users.
  //
  // redirectTo points to /onboarding (not /dashboard) as a safety net:
  //   - If the trigger has already resolved org_id, the middleware bounces them
  //     directly to /dashboard (org_id is set, no pending state).
  //   - If for any reason the trigger didn't resolve org_id (e.g. the DB
  //     function was not yet deployed), /onboarding catches them so they can
  //     still complete setup via "Join Existing" with the Enterprise Code.
  const { data: inviteData, error: inviteError } =
    await adminClient.auth.admin.inviteUserByEmail(email, {
      data: {
        org_id: ctx.orgId,
        // Placeholder public_key — UUID v4 pattern consistent with onboarding actions.
        public_key: crypto.randomUUID(),
        // Pass the role so the trigger can write user_roles immediately.
        // The server-side pre-upsert in Step 6 also covers this; both are
        // intentionally redundant for defence-in-depth.
        role: selectedRole,
      },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/onboarding`,
    });

  if (inviteError) {
    console.error("[inviteTeamMember] Auth invite error:", inviteError.message);

    // Surface a user-friendly message for the most common case: already invited.
    if (
      inviteError.message.toLowerCase().includes("already") ||
      inviteError.message.toLowerCase().includes("registered")
    ) {
      return {
        success: false,
        error: "This email address is already registered or has a pending invite.",
      };
    }
    return {
      success: false,
      error: "Failed to send the invite email. Please try again.",
    };
  }

  const inviteeId = inviteData.user?.id;
  if (!inviteeId) {
    // This shouldn't happen if inviteError is null, but be defensive.
    return {
      success: false,
      error: "Invite sent but could not resolve user ID. Role will be assigned on sign-in.",
    };
  }

  // Step 5: Upsert public.users with org_id.
  // This handles the edge case where the invitee already existed in auth.users
  // (e.g. they were previously in Supabase from another project). The
  // deferred-profile trigger handles new users; this covers existing ones.
  await adminClient
    .from("users")
    .upsert(
      {
        user_id: inviteeId,
        org_id: ctx.orgId,
        developer_email: email,
        public_key: crypto.randomUUID(),
      },
      { onConflict: "user_id", ignoreDuplicates: false },
    );

  // Step 6: Pre-insert the user_roles row.
  // Use upsert so if they already have a role in this org, we update it to
  // match what the Admin selected.
  const { error: roleError } = await adminClient
    .from("user_roles")
    .upsert(
      {
        user_id: inviteeId,
        org_id: ctx.orgId,
        role: selectedRole,
      },
      { onConflict: "user_id,org_id", ignoreDuplicates: false },
    );

  if (roleError) {
    // Non-fatal: the invite was sent. Log for investigation.
    console.error("[inviteTeamMember] Role upsert error:", roleError.message);
  }

  // Step 7: Revalidate the team page so the member list refreshes.
  revalidatePath("/dashboard/team");

  return { success: true };
}

// ---------------------------------------------------------------------------
// Action: listTeamMembers
// ---------------------------------------------------------------------------
// Returns all users who share the caller's org_id, along with their roles.
// Uses adminClient to bypass RLS for the JOIN-style query.
// ---------------------------------------------------------------------------

export async function listTeamMembers(): Promise<ListMembersResult> {
  const ctx = await resolveCallerContext();
  if (!ctx) {
    return { members: [], error: "Unauthorised." };
  }

  // Fetch all users in the org
  const { data: users, error: usersError } = await adminClient
    .from("users")
    .select("user_id, developer_email")
    .eq("org_id", ctx.orgId)
    .order("developer_email", { ascending: true });

  if (usersError) {
    console.error("[listTeamMembers] users query error:", usersError.message);
    return { members: [], error: "Failed to load team members." };
  }

  if (!users || users.length === 0) {
    return { members: [] };
  }

  // Fetch all role assignments for this org in one query
  const userIds = users.map((u) => u.user_id);
  const { data: roles, error: rolesError } = await adminClient
    .from("user_roles")
    .select("user_id, role, assigned_at")
    .eq("org_id", ctx.orgId)
    .in("user_id", userIds);

  if (rolesError) {
    console.error("[listTeamMembers] roles query error:", rolesError.message);
    // Non-fatal: return members without roles rather than an empty list.
  }

  // Build a role map keyed by user_id
  const roleMap = new Map<string, { role: InviteRole; assigned_at: string }>(
    (roles ?? []).map((r) => [
      r.user_id,
      { role: r.role as InviteRole, assigned_at: r.assigned_at },
    ]),
  );

  const members: TeamMember[] = users.map((u) => {
    const roleEntry = roleMap.get(u.user_id);
    return {
      user_id: u.user_id,
      developer_email: u.developer_email,
      role: roleEntry?.role ?? null,
      joined_at: roleEntry?.assigned_at ?? new Date(0).toISOString(),
    };
  });

  return { members };
}
