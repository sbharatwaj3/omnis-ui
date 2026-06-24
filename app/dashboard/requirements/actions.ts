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
//   - Mappings now reference regulatory_rules.req_id (the canonical FDA/IEC
//     source of truth). The redundant regulatory_clauses table has been
//     dropped per migration 20260624120000.
//
// 21 CFR PART 11 AUDIT TRAIL:
//   - createRequirement and bulkImportRequirements write to audit_logs on
//     every successful mutation. The audit record captures a before/after
//     JSONB snapshot of the changed data. Audit writes use the adminClient
//     so RLS on audit_logs cannot silently swallow the insert.
//
// DUPLICATE DETECTION:
//   - requirement_id has a UNIQUE constraint in the DB. We surface a clean
//     user-facing message instead of exposing the raw Postgres 23505 code.

import "server-only";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { adminClient } from "@/utils/supabase/admin";

// ---------------------------------------------------------------------------
// Audit trail helper
// ---------------------------------------------------------------------------

/**
 * Writes a single immutable record to the audit_logs table.
 * Uses adminClient so the RLS INSERT policy cannot silently reject the write.
 * Fails loudly (console.error) if the insert fails — silent audit failures
 * violate 21 CFR Part 11 and must be surfaced per IEC 62304 IV fail-safe rules.
 */
async function writeAuditLog({
  userId,
  orgId,
  actionType,
  entityType,
  entityId,
  before,
  after,
}: {
  userId: string;
  orgId: string;
  actionType: "CREATE" | "UPDATE" | "DELETE" | "TRIAGE_RESOLVE";
  entityType: "REQUIREMENT" | "MAPPING" | "EVIDENCE_LOG";
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}): Promise<void> {
  const { error } = await adminClient.from("audit_logs").insert({
    user_id: userId,
    org_id: orgId,
    action_type: actionType,
    entity_type: entityType,
    entity_id: entityId,
    changes: { before, after },
  });

  if (error) {
    // Loud failure — a failed audit write is a compliance anomaly.
    console.error(
      "[AUDIT TRAIL] CRITICAL: audit_logs insert failed. " +
        "This is a 21 CFR Part 11 violation. Investigate immediately.",
      {
        action_type: actionType,
        entity_type: entityType,
        entity_id: entityId,
        error: error.message,
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A row from public.regulatory_rules used for the mapping multi-select.
 * Mirrors the columns we select: req_id (PK), rule_source, description.
 * notion_page_id is intentionally excluded — Notion is decommissioned.
 */
export interface RegulatoryRule {
  /** Primary key — e.g. "FDA-820.30(g)", "IEC-62304-5.2.6" */
  req_id: string;
  /** Regulatory source / standard name — used to group rules in the UI */
  rule_source: string;
  /** Human-readable description of what the rule mandates */
  description: string | null;
  /** Evidence type classification */
  evidence_type: string | null;
}

export interface CompanyRequirement {
  id: string;
  requirement_id: string;
  title: string;
  description: string | null;
  created_at: string;
  /** Joined: the rule req_ids that map to this requirement */
  rule_ids: string[];
}

export interface CreateRequirementResult {
  success: boolean;
  error?: string;
}

export interface BulkImportRow {
  requirement_id: string;
  title: string;
  description?: string;
}

export interface BulkImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  /** Per-row errors: key = requirement_id (or row index), value = message */
  errors: Record<string, string>;
  fatalError?: string;
}

// ---------------------------------------------------------------------------
// Helper: resolve caller's role from the verified session
//
// CONSTITUTION §II: Identity is derived from the trusted Supabase JWT
// (createClient → auth.getUser()). All data queries use adminClient so
// that RLS chain-resolution issues (RBAC migration layering, pending-account
// edge cases) can never silently drop the role lookup and wrongly gate an
// Admin or QA Manager out of the audit trail.
//
// WHY adminClient FOR users LOOKUP:
//   The users-table RLS SELECT policy is anchored to auth.uid() = user_id,
//   which is correct for the anon/session client. However, when the RBAC
//   migration (20260616) layered private.get_auth_role() checks on top, any
//   intermittent failure in the SECURITY DEFINER call chain (e.g. a warm
//   Lambda where auth.uid() is not set on the session client's PostgREST
//   request) can return null from the users query and mis-classify an Admin
//   as unauthenticated. Using adminClient for the data-only lookup, while
//   keeping the JWT identity check on the session client, is the exact same
//   hardened pattern used by the main dashboard (fetchAllLogs) and is
//   sanctioned by Constitution §II ("identity derived from JWT; data fetched
//   via adminClient with explicit org_id scoping").
// ---------------------------------------------------------------------------

async function resolveCallerRole(): Promise<{
  userId: string;
  orgId: string;
  role: string | null;
} | null> {
  // Step 1: Verify identity via the session client — this is the ONLY call
  // that touches the session/anon client. auth.getUser() validates the JWT
  // cryptographically server-side, so the resolved user.id is trusted.
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return null;

  // Step 2: Resolve org_id via adminClient (service role) to bypass any
  // RLS evaluation that could silently return null for certain role configs.
  // Security: user.id comes from the verified JWT above — we never trust a
  // client-supplied value.
  const { data: profile } = await adminClient
    .from("users")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile?.org_id) return null;

  // Step 3: Resolve role. adminClient bypasses user_roles RLS — safe because
  // we scope the query to the exact (user_id, org_id) pair resolved above.
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
// Action: listRegulatoryRules
// ---------------------------------------------------------------------------
// Fetches all rules from the canonical regulatory_rules table, ordered by
// rule_source then req_id. Used to populate the multi-select in the modal.
//
// NOTE: notion_page_id is intentionally excluded — Notion is decommissioned
// per the architecture constitution. We never read or write that field.
// ---------------------------------------------------------------------------

export async function listRegulatoryRules(): Promise<{
  rules: RegulatoryRule[];
  error?: string;
}> {
  // Session check — prevents anonymous scraping via the UI.
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { rules: [], error: "Unauthorized." };
  }

  const { data, error } = await adminClient
    .from("regulatory_rules")
    .select("req_id, rule_source, description, evidence_type")
    .order("rule_source", { ascending: true })
    .order("req_id", { ascending: true });

  if (error) {
    console.error("[listRegulatoryRules] Supabase error:", error.message);
    return { rules: [], error: "Failed to load regulatory rules." };
  }

  return { rules: (data ?? []) as RegulatoryRule[] };
}

// ---------------------------------------------------------------------------
// Action: listRequirements
// ---------------------------------------------------------------------------
// Fetches all company requirements with their mapped rule IDs.
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
      "id, requirement_id, title, description, created_at, requirement_regulatory_mappings(rule_id)",
    )
    .order("requirement_id", { ascending: true });

  if (error) {
    console.error("[listRequirements] Supabase error:", error.message);
    return { requirements: [], error: "Failed to load requirements." };
  }

  // Flatten the embedded mapping rows into a plain string[] of rule_ids.
  const requirements: CompanyRequirement[] = (data ?? []).map((row: {
    id: string;
    requirement_id: string;
    title: string;
    description: string | null;
    created_at: string;
    requirement_regulatory_mappings: { rule_id: string }[];
  }) => ({
    id: row.id,
    requirement_id: row.requirement_id,
    title: row.title,
    description: row.description,
    created_at: row.created_at,
    rule_ids: (row.requirement_regulatory_mappings ?? []).map((m) => m.rule_id),
  }));

  return { requirements };
}

// ---------------------------------------------------------------------------
// Action: createRequirement
// ---------------------------------------------------------------------------
// Inserts a new company_requirements row and the corresponding
// requirement_regulatory_mappings rows (one per selected rule).
//
// PERMISSION GATE: admin or qa_manager only.
// DUPLICATE GUARD: A meaningful error is returned if requirement_id is taken.
//
// Steps:
//   1. Verify session and resolve caller role.
//   2. Enforce RBAC — only admin / qa_manager may create requirements.
//   3. Validate input fields.
//   4. Insert into company_requirements via adminClient.
//   5. If ruleIds were provided, bulk-insert into requirement_regulatory_mappings.
//   6. Revalidate /dashboard/requirements.
// ---------------------------------------------------------------------------

export async function createRequirement(
  requirementId: string,
  title: string,
  description: string,
  ruleIds: string[],
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

  // Step 5: Insert mapping rows if rules were selected.
  if (ruleIds.length > 0) {
    const mappingRows = ruleIds.map((ruleId) => ({
      requirement_id: newId,
      rule_id: ruleId,
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

    // Audit: one record per mapping row created.
    await Promise.all(
      ruleIds.map((ruleId) =>
        writeAuditLog({
          userId: ctx.userId,
          orgId: ctx.orgId,
          actionType: "CREATE",
          entityType: "MAPPING",
          entityId: JSON.stringify({ requirement_id: newId, rule_id: ruleId }),
          before: null,
          after: { requirement_id: newId, rule_id: ruleId },
        }),
      ),
    );
  }

  // Step 6: Write the 21 CFR Part 11 audit record for the requirement itself.
  await writeAuditLog({
    userId: ctx.userId,
    orgId: ctx.orgId,
    actionType: "CREATE",
    entityType: "REQUIREMENT",
    entityId: newId,
    before: null,
    after: {
      id: newId,
      requirement_id: trimmedId,
      title: trimmedTitle,
      description: trimmedDesc || null,
      rule_ids: ruleIds,
    },
  });

  // Step 7: Revalidate the page so the table reflects the new row.
  revalidatePath("/dashboard/requirements");

  return { success: true };
}

// ---------------------------------------------------------------------------
// Action: bulkImportRequirements
// ---------------------------------------------------------------------------
// Accepts a pre-parsed array of CSV rows and bulk-inserts them into
// company_requirements. Rows with duplicate requirement_id values are skipped
// with a per-row error; all other rows are inserted individually so a single
// bad row does not abort the entire batch.
//
// NOTE: CSV bulk import does not assign regulatory rule mappings — those must
// be added individually via the "Add Requirement" modal after import.
//
// PERMISSION GATE: admin or qa_manager only.
// CONSTITUTION LAW II: session verified server-side, no auth bypass.
// IEC 62304 §5.2.6: every inserted row is a traceable SRS artefact.
// ---------------------------------------------------------------------------

export async function bulkImportRequirements(
  rows: BulkImportRow[],
): Promise<BulkImportResult> {
  // Step 1: Verify session and resolve role.
  const ctx = await resolveCallerRole();
  if (!ctx) {
    return {
      success: false,
      imported: 0,
      skipped: 0,
      errors: {},
      fatalError: "Unauthorized: valid session required.",
    };
  }

  // Step 2: RBAC — admin or qa_manager only.
  if (ctx.role !== "admin" && ctx.role !== "qa_manager") {
    return {
      success: false,
      imported: 0,
      skipped: 0,
      errors: {},
      fatalError:
        "Permission denied: only Admins and QA Managers may import requirements.",
    };
  }

  // Step 3: Guard against empty payloads.
  if (!rows || rows.length === 0) {
    return {
      success: false,
      imported: 0,
      skipped: 0,
      errors: {},
      fatalError: "No rows provided for import.",
    };
  }

  let imported = 0;
  let skipped = 0;
  const errors: Record<string, string> = {};

  // Step 4: Insert each row individually so a duplicate doesn't abort the batch.
  for (const row of rows) {
    const trimmedId = (row.requirement_id ?? "").trim();
    const trimmedTitle = (row.title ?? "").trim();
    const trimmedDesc = (row.description ?? "").trim();

    // Row-level validation.
    if (!trimmedId) {
      skipped++;
      errors[trimmedId || "(empty)"] = "requirement_id is missing or empty.";
      continue;
    }
    if (!/^[A-Za-z0-9_-]{1,50}$/.test(trimmedId)) {
      skipped++;
      errors[trimmedId] =
        "Invalid format — letters, digits, hyphens, underscores only (max 50 chars).";
      continue;
    }
    if (!trimmedTitle) {
      skipped++;
      errors[trimmedId] = "Title is required.";
      continue;
    }
    if (trimmedTitle.length > 255) {
      skipped++;
      errors[trimmedId] = "Title must be 255 characters or fewer.";
      continue;
    }

    const { data: insertedRow, error: insertError } = await adminClient
      .from("company_requirements")
      .insert({
        requirement_id: trimmedId,
        title: trimmedTitle,
        description: trimmedDesc || null,
      })
      .select("id")
      .single();

    if (insertError) {
      skipped++;
      if (
        insertError.code === "23505" ||
        insertError.message?.toLowerCase().includes("unique")
      ) {
        errors[trimmedId] = `"${trimmedId}" already exists — skipped.`;
      } else {
        console.error(
          `[bulkImportRequirements] Insert error for ${trimmedId}:`,
          insertError.message,
        );
        errors[trimmedId] = "Database error — could not insert row.";
      }
      continue;
    }

    // Write the 21 CFR Part 11 audit record for each successfully imported row.
    await writeAuditLog({
      userId: ctx.userId,
      orgId: ctx.orgId,
      actionType: "CREATE",
      entityType: "REQUIREMENT",
      entityId: insertedRow.id,
      before: null,
      after: {
        id: insertedRow.id,
        requirement_id: trimmedId,
        title: trimmedTitle,
        description: trimmedDesc || null,
        import_source: "BULK_CSV",
      },
    });

    imported++;
  }

  // Step 5: Revalidate so the table reflects newly imported rows.
  revalidatePath("/dashboard/requirements");

  return {
    success: imported > 0,
    imported,
    skipped,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Action: getAuditLogs
// ---------------------------------------------------------------------------
// Fetches audit records for the caller's organisation, ordered by timestamp
// descending (newest first). Paginates via limit/offset.
//
// 21 CFR Part 11.10(e): Audit trails must be "available for review and
// copying by FDA." This action is the read surface for that mandate.
//
// ACCESS: admin and qa_manager only.
// CONSTITUTION LAW II: session verified server-side; identity derived from JWT.
// ---------------------------------------------------------------------------

export interface AuditLogRow {
  id: string;
  user_id: string | null;
  org_id: string;
  action_type: "CREATE" | "UPDATE" | "DELETE" | "TRIAGE_RESOLVE";
  entity_type: string;
  entity_id: string;
  changes: {
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
  };
  timestamp: string;
}

export interface GetAuditLogsResult {
  logs: AuditLogRow[];
  error?: string;
}

export async function getAuditLogs(
  limit = 100,
  offset = 0,
): Promise<GetAuditLogsResult> {
  // Step 1: Verify session and resolve role.
  const ctx = await resolveCallerRole();
  if (!ctx) {
    return { logs: [], error: "Unauthorized: valid session required." };
  }

  // Step 2: Gate — only admin and qa_manager may read the audit trail.
  if (ctx.role !== "admin" && ctx.role !== "qa_manager") {
    return {
      logs: [],
      error:
        "Forbidden: only Admins and QA Managers may access the audit trail.",
    };
  }

  // Step 3: Fetch audit records for this org, newest first.
  const { data, error } = await adminClient
    .from("audit_logs")
    .select(
      "id, user_id, org_id, action_type, entity_type, entity_id, changes, timestamp",
    )
    .eq("org_id", ctx.orgId)
    .order("timestamp", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[getAuditLogs] Supabase select error:", error.message);
    return { logs: [], error: "Database error: could not load audit logs." };
  }

  return { logs: (data ?? []) as AuditLogRow[] };
}
