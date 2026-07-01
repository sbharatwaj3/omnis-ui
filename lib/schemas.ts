// omnis-ui/lib/schemas.ts
// Shared Zod validation schemas for server actions and API routes.
//
// Security Standard §III.1: No raw JSON payload, form submission, or URL
// parameter may be processed without passing through a strict Zod schema.
// Security Standard §III.2: Unknown fields are stripped (.strip()) by default.
//
// USAGE: Import the schema, call .safeParse() on raw input, and check
// .success before using .data. Return an error to the client on failure.

import { z } from "zod";

// ---------------------------------------------------------------------------
// Re-usable primitives
// ---------------------------------------------------------------------------

/** UUID v4 — matches Supabase-generated IDs and enterprise codes. */
export const uuidSchema = z
  .string()
  .uuid({ message: "Must be a valid UUID." });

/** Safe text field — non-empty, trimmed, max-length guarded. */
export const safeTextSchema = (max: number, fieldName = "Field") =>
  z
    .string()
    .trim()
    .min(1, { message: `${fieldName} is required.` })
    .max(max, { message: `${fieldName} must be ${max} characters or fewer.` });

/** Requirement ID — letters, digits, hyphens, underscores (SRS-001 style). */
export const requirementIdSchema = z
  .string()
  .trim()
  .min(1, { message: "Requirement ID is required." })
  .max(50, { message: "Requirement ID must be 50 characters or fewer." })
  .regex(/^[A-Za-z0-9_-]+$/, {
    message:
      "Requirement ID may only contain letters, digits, hyphens, and underscores. Example: SRS-001",
  });

/** RBAC role enum — must match the CHECK constraint in user_roles. */
export const roleSchema = z.enum(["admin", "qa_manager", "developer", "viewer"], {
  errorMap: () => ({ message: "Please select a valid role." }),
});

// ---------------------------------------------------------------------------
// /api/ingest — IngestPayload schema
// ---------------------------------------------------------------------------
// Validates the body sent by omnis-cli / PowerShell test harness.
// Unknown fields are stripped to prevent payload bloat reaching the DB.
// ---------------------------------------------------------------------------

export const ingestPayloadSchema = z
  .object({
    results: z.unknown().refine((v) => v !== undefined && v !== null, {
      message: "'results' field is required in the JSON body.",
    }),
    build_version: z.string().trim().max(100).optional(),
    req_id: z.string().trim().max(100).optional(),
    execution_status: z.string().trim().max(50).optional(),
    developer_email: z.string().trim().email().max(255).optional().or(z.literal("")),
  })
  .strip();

export type IngestPayload = z.infer<typeof ingestPayloadSchema>;

// ---------------------------------------------------------------------------
// Onboarding — createOrganization
// ---------------------------------------------------------------------------

export const createOrganizationSchema = z.object({
  company_name: safeTextSchema(120, "Company name").refine(
    (v) => v.length >= 2,
    { message: "Company name must be at least 2 characters." }
  ),
});

// ---------------------------------------------------------------------------
// Onboarding — joinOrganization
// ---------------------------------------------------------------------------

export const joinOrganizationSchema = z.object({
  enterprise_code: uuidSchema.describe("Enterprise code must be a valid UUID."),
  role: roleSchema,
});

// ---------------------------------------------------------------------------
// Team — inviteTeamMember
// ---------------------------------------------------------------------------

export const inviteTeamMemberSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email({ message: "A valid email address is required." })
    .max(255),
  role: roleSchema,
});

// ---------------------------------------------------------------------------
// Settings — generateApiKey
// ---------------------------------------------------------------------------

export const generateApiKeySchema = z.object({
  name: safeTextSchema(120, "Key name"),
});

// ---------------------------------------------------------------------------
// Requirements — createRequirement
// ---------------------------------------------------------------------------

export const createRequirementSchema = z.object({
  requirementId: requirementIdSchema,
  title: safeTextSchema(255, "Title"),
  description: z.string().trim().max(5000).optional().default(""),
  ruleIds: z.array(z.string().trim().min(1)).default([]),
});

// ---------------------------------------------------------------------------
// Requirements — bulkImportRequirements row
// ---------------------------------------------------------------------------

export const bulkImportRowSchema = z
  .object({
    requirement_id: requirementIdSchema,
    title: safeTextSchema(255, "Title"),
    description: z.string().trim().max(5000).optional().default(""),
  })
  .strip();

export type BulkImportRowValidated = z.infer<typeof bulkImportRowSchema>;
