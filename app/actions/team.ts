"use server";
// omnis-ui/app/actions/team.ts
// Team Management Server Actions — invite teammates, remove users, list org members.
//
// CONSTITUTION LAW II:
//   - Session verified server-side on every invocation. No auth bypass.
//   - org_id is resolved from the verified session, never trusted from the client.
//   - All secrets loaded via process.env; nothing is hardcoded.
//
// SECURITY MODEL:
//   - Only admins may invite or remove users (enforced server-side).
//     qa_managers can view and approve compliance logs but cannot manage team.
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
//   2. Reject if caller is not admin.
//   3. Validate email and role input.
//   4. Call auth.admin.inviteUserByEmail — Supabase sends the magic-link email.
//      The `data.options.data` payload seeds the raw_user_meta_data which the
//      deferred-profile trigger reads to assign org_id on sign-up.
//   5. Pre-insert a user_roles row so the role is applied at first login.
//   6. Upsert public.users with org_id in case the user already exists in auth.
//
// REMOVE FLOW:
//   1. Verify caller session and resolve their org_id + role.
//   2. Reject if caller is not admin.
//   3. Prevent self-removal.
//   4. Delete the user_roles row (removes org access) and clear org_id from
//      public.users — keeps the auth account intact but boots them from the org.

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { adminClient } from "@/utils/supabase/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InviteRole = "admin" | "qa_manager" | "developer" | "viewer";

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

export interface RemoveResult {
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
// PERMISSION GATE: admin only.
// ---------------------------------------------------------------------------

export async function inviteTeamMember(
  formData: FormData,
): Promise<InviteResult> {
  // Step 1: Resolve caller context (session + org + role).
  const ctx = await resolveCallerContext();
  if (!ctx) {
    return { success: false, error: "Unauthorized: valid session required." };
  }

  // Step 2: Enforce RBAC — only Admins may send invites.
  if (ctx.role !== "admin") {
    return {
      success: false,
      error: "Permission denied: only Admins can invite team members.",
    };
  }

  // Step 3: Validate inputs.
  const email = (formData.get("email") as string | null)?.trim().toLowerCase();
  const selectedRole = (formData.get("role") as string | null)?.trim() as InviteRole | null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: "A valid email address is required." };
  }

  const validRoles: InviteRole[] = ["admin", "qa_manager", "developer", "viewer"];
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
  //   - If for any reason the trigger didn't resolve org_id, /onboarding catches
  //     them so they can still complete setup via "Join Existing" with the
  //     Enterprise Code.
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
    return {
      success: false,
      error: "Invite sent but could not resolve user ID. Role will be assigned on sign-in.",
    };
  }

  // Step 5: Upsert public.users with org_id.
  // Handles the edge case where the invitee already existed in auth.users.
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
    console.error("[inviteTeamMember] Role upsert error:", roleError.message);
  }

  // Step 7: Revalidate the team page so the member list refreshes.
  revalidatePath("/dashboard/team");

  return { success: true };
}

// ---------------------------------------------------------------------------
// Action: removeTeamMember
// ---------------------------------------------------------------------------
// Removes a user from the organization by:
//   - Deleting their user_roles row (strips dashboard access via RLS).
//   - Clearing org_id on their public.users row (routes them to /onboarding
//     if they attempt to log in again).
//
// The auth.users account is intentionally preserved so the user's email can
// be re-invited later without creating a duplicate account.
//
// PERMISSION GATE: admin only. Self-removal is blocked.
// ---------------------------------------------------------------------------

export async function removeTeamMember(
  targetUserId: string,
): Promise<RemoveResult> {
  // Step 1: Resolve caller context.
  const ctx = await resolveCallerContext();
  if (!ctx) {
    return { success: false, error: "Unauthorized: valid session required." };
  }

  // Step 2: Enforce RBAC — only Admins may remove users.
  if (ctx.role !== "admin") {
    return {
      success: false,
      error: "Permission denied: only Admins can remove team members.",
    };
  }

  // Step 3: Prevent self-removal — an admin cannot remove themselves to avoid
  // locking an org without any admin.
  if (targetUserId === ctx.userId) {
    return {
      success: false,
      error: "You cannot remove yourself from the organization.",
    };
  }

  // Step 4: Verify the target user actually belongs to the caller's org.
  // This prevents an admin from removing users from other orgs by guessing
  // user IDs (cross-tenant protection).
  const { data: targetProfile } = await adminClient
    .from("users")
    .select("user_id, org_id")
    .eq("user_id", targetUserId)
    .eq("org_id", ctx.orgId)
    .single();

  if (!targetProfile) {
    return {
      success: false,
      error: "User not found in your organization.",
    };
  }

  // Step 5: Delete the user_roles row — this immediately revokes dashboard
  // access via the RLS policy that requires get_auth_role() IS NOT NULL.
  const { error: roleDeleteError } = await adminClient
    .from("user_roles")
    .delete()
    .eq("user_id", targetUserId)
    .eq("org_id", ctx.orgId);

  if (roleDeleteError) {
    console.error("[removeTeamMember] Role delete error:", roleDeleteError.message);
    return {
      success: false,
      error: "Failed to remove user from the organization. Please try again.",
    };
  }

  // Step 6: Clear org_id on the user's profile row so they are routed to
  // /onboarding (pending state) if they attempt to sign in again.
  const { error: profileUpdateError } = await adminClient
    .from("users")
    .update({ org_id: null })
    .eq("user_id", targetUserId);

  if (profileUpdateError) {
    // Non-fatal: role row is deleted, RLS blocks access. Log for investigation.
    console.error("[removeTeamMember] Profile org_id clear error:", profileUpdateError.message);
  }

  // Step 7: Revalidate the team page.
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
    return { members: [], error: "Unauthorized." };
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
