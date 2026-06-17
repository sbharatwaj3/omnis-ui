"use client";
// omnis-ui/hooks/useUserRole.ts
// Client-side hook that resolves the current user's RBAC role.
//
// Fetches from public.user_roles via the Supabase anon-key session client.
// The SELECT policy allows authenticated users to read their own role record.
// Falls back gracefully to null if the user has no role assignment (pending).

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

export type UserRole = "qa_manager" | "developer" | "viewer" | null;

export interface UseUserRoleResult {
  role: UserRole;
  loading: boolean;
}

export function useUserRole(): UseUserRoleResult {
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchRole() {
      const supabase = createClient();

      // Get the current user's identity
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) {
          setRole(null);
          setLoading(false);
        }
        return;
      }

      // Resolve org_id from the users table
      const { data: profile } = await supabase
        .from("users")
        .select("org_id")
        .eq("user_id", user.id)
        .single();

      if (!profile?.org_id) {
        if (!cancelled) {
          setRole(null);
          setLoading(false);
        }
        return;
      }

      // Fetch the role for this user in their org
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("org_id", profile.org_id)
        .single();

      if (!cancelled) {
        setRole((roleRow?.role as UserRole) ?? null);
        setLoading(false);
      }
    }

    fetchRole();
    return () => {
      cancelled = true;
    };
  }, []);

  return { role, loading };
}
