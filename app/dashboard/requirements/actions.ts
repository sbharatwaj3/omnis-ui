"use server";
// omnis-ui/app/dashboard/requirements/actions.ts
// Requirements Management Server Actions — fetch, create, and map requirements.
//
// CONSTITUTION LAW II:
//   - Session verified server-side on every invocation. No auth bypass.
//   - Only admin and qa_manager roles may create requirements or mappings.
//     Enforced by the DB RLS policy AND re-enforced here server-side.
//   - All secrets loaded via process.env; nothing hardcoded.
//   - adminClient is used for data reads to bypass RBAC-gated RLS on joins.
//
// IEC 62304 §5.2.6 ALIGNMENT:
//   - company_requirements maps to the SRS artefact class.
//   - requirement_regulatory_mappings satisfies bidirectional traceability.
//
// DUPLICATE DETECTION:
//   - requirement_id has a UNIQUE constraint in the DB. We surface a clean
//     user-facing message instead of exposing the raw Postgres 23505 code.

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { adminClient } from "@/utils/supabase/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegulatoryClause {
  id: string;
  standard_name: string;
  clause_number: string;
  description: string | null;
}

export interface CompanyRequirement {
  id: string;
  requirement_id: string;
  title: string;
  description: string | null;
  created_at: string;
  // Joined: the clause IDs that map to this requirement
  clause_ids: string[];
}

export interface CreateRequirementResult {
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helper: resolve caller's role from the verified session
// ---------------------------------------------------------------------------

async function resolveCallerRole(): Promise<{
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

  const { data: profile } = await supabase
    .from("users")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile?.org_id) return null;

  const { data: roleRow } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", profile.org_id)
    .single();

  return {
    userId: user.id,
    orgId: profile.org_id as string,
    role: roleRow?.role ?? null,
  };
}

// ---------------------------------------------------------------------------
// Action: listRegulatoryClauses
// ---------------------------------------------------------------------------
// Fetches all clauses from regulatory_clauses, ordered by standard then clause.
// Used to populate the dropdown in the "Add New Requirement" modal.
// ---------------------------------------------------------------------------

export async function listRegulatoryClauses(): Promise<{
  clauses: RegulatoryClause[];
  error?: string;
}> {
  // Session check — we need a valid authenticated user even though the table
  // has a public SELECT policy. This prevents anonymous scraping via the UI.
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { clauses: [], error: "Unauthorized." };
  }

  const { data, error } = await adminClient
    .from("regulatory_clauses")
    .select("id, standard_name, clause_number, description")
    .order("standard_name", { ascending: true })
    .order("clause_number", { ascending: true });

  if (error) {
    console.error("[listRegulatoryClauses] Supabase error:", error.message);
    return { clauses: [], error: "Failed to load regulatory clauses." };
  }

  return { clauses: (data ?? []) as RegulatoryClause[] };
}

// ---------------------------------------------------------------------------
// Action: listRequirements
// ---------------------------------------------------------------------------
// Fetches all company requirements with their mapped clause IDs.
// Returns rows ordered by requirement_id ascending (SRS-001, SRS-002, …).
// ---------------------------------------------------------------------------

export async function listRequirements(): Promise<{
  requirements: CompanyRequirement[];
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { requirements: [], error: "Unauthorized." };
  }

  // Fetch requirements with their mapping rows in a single query.
  // Supabase handles the left-join via the embedded select syntax.
  const { data, error } = await adminClient
    .from("company_requirements")
    .select(
      "id, requirement_id, title, description, created_at, requirement_regulatory_mappings(clause_id)",
    )
    .order("requirement_id", { ascending: true });

  if (error) {
    console.error("[listRequirements] Supabase error:", error.message);
    return { requirements: [], error: "Failed to load requirements." };
  }

  // Flatten the embedded mapping rows into a plain string[] of clause_ids.
  const requirements: CompanyRequirement[] = (data ?? []).map((row: {
    id: string;
    requirement_id: string;
    title: string;
    description: string | null;
    created_at: string;
    requirement_regulatory_mappings: { clause_id: string }[];
  }) => ({
    id: row.id,
    requirement_id: row.requirement_id,
    title: row.title,
    description: row.description,
    created_at: row.created_at,
    clause_ids: (row.requirement_regulatory_mappings ?? []).map(
      (m) => m.clause_id,
    ),
  }));

  return { requirements };
}

// ---------------------------------------------------------------------------
// Action: createRequirement
// ---------------------------------------------------------------------------
// Inserts a new company_requirements row and the corresponding
// requirement_regulatory_mappings rows (one per selected clause).
//
// PERMISSION GATE: admin or qa_manager only.
// DUPLICATE GUARD: A meaningful error is returned if requirement_id is taken.
//
// Steps:
//   1. Verify session and resolve caller role.
//   2. Enforce RBAC — only admin / qa_manager may create requirements.
//   3. Validate input fields.
//   4. Insert into company_requirements via adminClient.
//   5. If clause_ids were provided, bulk-insert into requirement_regulatory_mappings.
//   6. Revalidate /dashboard/requirements.
// ---------------------------------------------------------------------------

export async function createRequirement(
  requirementId: string,
  title: string,
  description: string,
  clauseIds: string[],
): Promise<CreateRequirementResult> {
  // Step 1: Verify session.
  const ctx = await resolveCallerRole();
  if (!ctx) {
    return { success: false, error: "Unauthorized: valid session required." };
  }

  // Step 2: Enforce RBAC.
  if (ctx.role !== "admin" && ctx.role !== "qa_manager") {
    return {
      success: false,
      error:
        "Permission denied: only Admins and QA Managers may create requirements.",
    };
  }

  // Step 3: Validate inputs.
  const trimmedId = requirementId.trim();
  const trimmedTitle = title.trim();
  const trimmedDesc = description.trim();

  if (!trimmedId) {
    return { success: false, error: "Requirement ID is required." };
  }
  // Enforce SRS-NNN / SDS-NNN style — letters, digits, hyphens, underscores only.
  if (!/^[A-Za-z0-9_-]{1,50}$/.test(trimmedId)) {
    return {
      success: false,
      error:
        "Requirement ID may only contain letters, digits, hyphens, and underscores (max 50 chars). Example: SRS-001",
    };
  }
  if (!trimmedTitle) {
    return { success: false, error: "Title is required." };
  }
  if (trimmedTitle.length > 255) {
    return {
      success: false,
      error: "Title must be 255 characters or fewer.",
    };
  }

  // Step 4: Insert the requirement row.
  const { data: inserted, error: insertError } = await adminClient
    .from("company_requirements")
    .insert({
      requirement_id: trimmedId,
      title: trimmedTitle,
      description: trimmedDesc || null,
    })
    .select("id")
    .single();

  if (insertError) {
    // Postgres unique-violation code: 23505
    if (
      insertError.code === "23505" ||
      insertError.message?.toLowerCase().includes("unique")
    ) {
      return {
        success: false,
        error: `Requirement ID "${trimmedId}" already exists. Please choose a unique identifier.`,
      };
    }
    console.error("[createRequirement] Insert error:", insertError.message);
    return {
      success: false,
      error: "Database error: could not create the requirement. Please try again.",
    };
  }

  const newId: string = inserted.id;

  // Step 5: Insert mapping rows if clauses were selected.
  if (clauseIds.length > 0) {
    const mappingRows = clauseIds.map((clauseId) => ({
      requirement_id: newId,
      clause_id: clauseId,
    }));

    const { error: mappingError } = await adminClient
      .from("requirement_regulatory_mappings")
      .insert(mappingRows);

    if (mappingError) {
      console.error(
        "[createRequirement] Mapping insert error:",
        mappingError.message,
      );
      // Non-fatal: requirement was created; mapping failed. Surface warning.
      return {
        success: false,
        error:
          "Requirement created, but regulatory mappings could not be saved. Please edit the requirement to add mappings.",
      };
    }
  }

  // Step 6: Revalidate the page so the table reflects the new row.
  revalidatePath("/dashboard/requirements");

  return { success: true };
}
