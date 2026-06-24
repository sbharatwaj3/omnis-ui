// omnis-ui/types/supabase.ts
//
// AUTO-GENERATED — do not edit by hand.
// Regenerate with: supabase gen types typescript --linked > types/supabase.ts
// (run from omnis-api/)
//
// This file is the single source of truth for all Supabase table/view types
// in the omnis-ui frontend. Import from here rather than writing ad-hoc
// inline types for database rows.
//
// CONSTITUTION LAW I (§VII): Server Actions and Route Handlers that touch
// tenant data must be typed against this file. The Database generic should
// be passed to createClient so Supabase query builders are fully type-safe.
//
// Usage:
//   import type { Database }      from "@/types/supabase";
//   import type { Tables, TablesInsert, TablesUpdate } from "@/types/supabase";
//
//   // Strongly-typed client
//   createServerClient<Database>(url, key, ...);
//
//   // Row type helpers
//   type EvidenceLog         = Tables<"evidence_logs">;
//   type NewRequirement      = TablesInsert<"company_requirements">;
//   type RequirementUpdate   = TablesUpdate<"company_requirements">;

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_triage_queue: {
        Row: {
          id: string
          evidence_log_id: string
          original_req_id: string
          suggested_req_id: string
          ai_reasoning: string
          status: "pending" | "approved" | "rejected"
          created_at: string
        }
        Insert: {
          id?: string
          evidence_log_id: string
          original_req_id: string
          suggested_req_id: string
          ai_reasoning: string
          status?: "pending" | "approved" | "rejected"
          created_at?: string
        }
        Update: {
          id?: string
          evidence_log_id?: string
          original_req_id?: string
          suggested_req_id?: string
          ai_reasoning?: string
          status?: "pending" | "approved" | "rejected"
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_triage_queue_evidence_log_id_fkey"
            columns: ["evidence_log_id"]
            isOneToOne: false
            referencedRelation: "evidence_logs"
            referencedColumns: ["log_id"]
          },
        ]
      }
      // -----------------------------------------------------------------------
      // audit_logs — 21 CFR Part 11 immutable audit trail.
      // Append-only: no UPDATE or DELETE policies exist at the DB layer.
      // -----------------------------------------------------------------------
      audit_logs: {
        Row: {
          id: string
          /** Supabase Auth user who performed the action. NULL for service_role background tasks. */
          user_id: string | null
          /** Org scoping key. Stored without FK so records survive org deletion. */
          org_id: string
          /** The operation performed: CREATE | UPDATE | DELETE | TRIAGE_RESOLVE */
          action_type: "CREATE" | "UPDATE" | "DELETE" | "TRIAGE_RESOLVE"
          /** The class of entity affected: REQUIREMENT | MAPPING | EVIDENCE_LOG */
          entity_type: string
          /** Primary key of the affected entity, serialised as TEXT. */
          entity_id: string
          /** Before/after snapshot: { before: {...}|null, after: {...}|null } */
          changes: {
            before: Record<string, unknown> | null
            after: Record<string, unknown> | null
          }
          /** Server-set timestamp — never supplied by the client. */
          timestamp: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          org_id: string
          action_type: "CREATE" | "UPDATE" | "DELETE" | "TRIAGE_RESOLVE"
          entity_type: string
          entity_id: string
          changes: {
            before: Record<string, unknown> | null
            after: Record<string, unknown> | null
          }
          timestamp?: string
        }
        // UPDATE is intentionally omitted — audit_logs rows are immutable.
        // The DB enforces this with the absence of an UPDATE RLS policy.
        Update: Record<string, never>
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_compliance_insights: {
        Row: {
          ai_confidence_score: number | null
          ai_reasoning: string | null
          ai_result_summary: string | null
          ai_test_suite: string | null
          created_at: string | null
          id: string
          log_id: string | null
        }
        Insert: {
          ai_confidence_score?: number | null
          ai_reasoning?: string | null
          ai_result_summary?: string | null
          ai_test_suite?: string | null
          created_at?: string | null
          id?: string
          log_id?: string | null
        }
        Update: {
          ai_confidence_score?: number | null
          ai_reasoning?: string | null
          ai_result_summary?: string | null
          ai_test_suite?: string | null
          created_at?: string | null
          id?: string
          log_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_compliance_insights_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "evidence_logs"
            referencedColumns: ["log_id"]
          },
        ]
      }
      builds: {
        Row: {
          build_id: string
          compiled_at: string | null
          org_id: string
          version_string: string
        }
        Insert: {
          build_id: string
          compiled_at?: string | null
          org_id: string
          version_string: string
        }
        Update: {
          build_id?: string
          compiled_at?: string | null
          org_id?: string
          version_string?: string
        }
        Relationships: [
          {
            foreignKeyName: "builds_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["org_id"]
          },
        ]
      }
      company_requirements: {
        Row: {
          created_at: string
          description: string | null
          id: string
          requirement_id: string
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          requirement_id: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          requirement_id?: string
          title?: string
        }
        Relationships: []
      }
      evidence_logs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          build_id: string
          event_source: string
          execution_status: string
          execution_timestamp: string
          is_deprecated: boolean | null
          log_id: string
          org_id: string
          previous_log_hash: string | null
          raw_command: string
          req_id: string
          sanitized_payload: Json
          signature_hash: string
          supersedes_log_id: string | null
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          build_id: string
          event_source: string
          execution_status: string
          execution_timestamp: string
          is_deprecated?: boolean | null
          log_id: string
          org_id: string
          previous_log_hash?: string | null
          raw_command: string
          req_id: string
          sanitized_payload: Json
          signature_hash: string
          supersedes_log_id?: string | null
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          build_id?: string
          event_source?: string
          execution_status?: string
          execution_timestamp?: string
          is_deprecated?: boolean | null
          log_id?: string
          org_id?: string
          previous_log_hash?: string | null
          raw_command?: string
          req_id?: string
          sanitized_payload?: Json
          signature_hash?: string
          supersedes_log_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_logs_build_id_fkey"
            columns: ["build_id"]
            isOneToOne: false
            referencedRelation: "builds"
            referencedColumns: ["build_id"]
          },
          {
            foreignKeyName: "evidence_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "evidence_logs_req_id_fkey"
            columns: ["req_id"]
            isOneToOne: false
            referencedRelation: "regulatory_rules"
            referencedColumns: ["req_id"]
          },
          {
            foreignKeyName: "evidence_logs_supersedes_log_id_fkey"
            columns: ["supersedes_log_id"]
            isOneToOne: true
            referencedRelation: "evidence_logs"
            referencedColumns: ["log_id"]
          },
          {
            foreignKeyName: "evidence_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      organization_api_keys: {
        Row: {
          created_at: string
          id: string
          key_hash: string
          key_prefix: string
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          key_hash: string
          key_prefix: string
          name: string
          org_id: string
        }
        Update: {
          created_at?: string
          id?: string
          key_hash?: string
          key_prefix?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_api_keys_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["org_id"]
          },
        ]
      }
      organizations: {
        Row: {
          company_name: string
          created_at: string | null
          org_id: string
          stripe_customer_id: string | null
          subscription_status: string
          token_units_limit: number
          token_units_used: number
        }
        Insert: {
          company_name: string
          created_at?: string | null
          org_id: string
          stripe_customer_id?: string | null
          subscription_status?: string
          token_units_limit?: number
          token_units_used?: number
        }
        Update: {
          company_name?: string
          created_at?: string | null
          org_id?: string
          stripe_customer_id?: string | null
          subscription_status?: string
          token_units_limit?: number
          token_units_used?: number
        }
        Relationships: []
      }
      // regulatory_clauses was dropped in migration 20260624120000.
      // Use regulatory_rules as the canonical FDA/IEC code source.
      regulatory_frameworks: {
        Row: {
          clause_code: string
          clinical_heuristic: string
          created_at: string | null
          description: string
          embedding: string | null
          framework: string
          id: string
          title: string
        }
        Insert: {
          clause_code: string
          clinical_heuristic: string
          created_at?: string | null
          description: string
          embedding?: string | null
          framework: string
          id?: string
          title: string
        }
        Update: {
          clause_code?: string
          clinical_heuristic?: string
          created_at?: string | null
          description?: string
          embedding?: string | null
          framework?: string
          id?: string
          title?: string
        }
        Relationships: []
      }
      regulatory_rules: {
        Row: {
          description: string | null
          evidence_type: string | null
          notion_page_id: string | null
          req_id: string
          rule_source: string
        }
        Insert: {
          description?: string | null
          evidence_type?: string | null
          notion_page_id?: string | null
          req_id: string
          rule_source: string
        }
        Update: {
          description?: string | null
          evidence_type?: string | null
          notion_page_id?: string | null
          req_id?: string
          rule_source?: string
        }
        Relationships: []
      }
      requirement_regulatory_mappings: {
        Row: {
          requirement_id: string
          rule_id: string
        }
        Insert: {
          requirement_id: string
          rule_id: string
        }
        Update: {
          requirement_id?: string
          rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "requirement_regulatory_mappings_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "company_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requirement_regulatory_mappings_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "regulatory_rules"
            referencedColumns: ["req_id"]
          },
        ]
      }
      revoked_keys: {
        Row: {
          key_id: string
          reason: string | null
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          key_id?: string
          reason?: string | null
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          key_id?: string
          reason?: string | null
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "revoked_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          assigned_at: string
          id: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          id?: string
          org_id: string
          role: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          id?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      users: {
        Row: {
          developer_email: string
          org_id: string | null
          public_key: string | null
          user_id: string
        }
        Insert: {
          developer_email: string
          org_id?: string | null
          public_key?: string | null
          user_id: string
        }
        Update: {
          developer_email?: string
          org_id?: string | null
          public_key?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["org_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      increment_token_units_used: {
        Args: { p_org_id: string }
        Returns: undefined
      }
      match_regulatory_codes: {
        Args: {
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          clause_code: string
          clinical_heuristic: string
          framework: string
          id: string
          similarity: number
          title: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

// ---------------------------------------------------------------------------
// Convenience row-type aliases — import these directly rather than using the
// verbose Tables<"table_name"> form in component and action files.
// ---------------------------------------------------------------------------

/**
 * A row from public.regulatory_rules — the canonical FDA/IEC code source.
 * regulatory_clauses was dropped in migration 20260624120000.
 */
export type RegulatoryRule = Tables<"regulatory_rules">

/** A row from public.company_requirements */
export type CompanyRequirement = Tables<"company_requirements">

/** A join row from public.requirement_regulatory_mappings */
export type RequirementRegulatoryMapping =
  Tables<"requirement_regulatory_mappings">

/** Insert shape for public.company_requirements */
export type NewCompanyRequirement = TablesInsert<"company_requirements">

/** Insert shape for public.requirement_regulatory_mappings */
export type NewRequirementRegulatoryMapping =
  TablesInsert<"requirement_regulatory_mappings">

/**
 * A fully-resolved traceability matrix row — a requirement with its mapped
 * rules joined in. Constructed at the query layer by the Server Action;
 * typed here for use in page components.
 */
export type TraceabilityMatrixRow = CompanyRequirement & {
  rules: RegulatoryRule[]
}

/** A row from public.ai_triage_queue */
export type AiTriageQueueRow = Tables<"ai_triage_queue">

/** Insert shape for public.ai_triage_queue (used by the Bedrock pipeline) */
export type NewAiTriageQueueItem = TablesInsert<"ai_triage_queue">

/** Update shape for public.ai_triage_queue (used by resolveTriageItem) */
export type AiTriageQueueUpdate = TablesUpdate<"ai_triage_queue">

/** The three valid lifecycle states of a triage item */
export type TriageStatus = "pending" | "approved" | "rejected"

// ---------------------------------------------------------------------------
// 21 CFR Part 11 Audit Trail types
// ---------------------------------------------------------------------------

/** A row from public.audit_logs — the immutable 21 CFR Part 11 audit ledger */
export type AuditLog = Tables<"audit_logs">

/**
 * Insert shape for public.audit_logs.
 * Use this when writing audit records from Server Actions.
 * Note: timestamp is intentionally omitted — always set by the DB server clock.
 */
export type NewAuditLog = TablesInsert<"audit_logs">

/** The four action verbs used in the audit trail */
export type AuditActionType = "CREATE" | "UPDATE" | "DELETE" | "TRIAGE_RESOLVE"

/**
 * The entity classes tracked by the audit trail.
 * Extend this union as new tracked entity types are introduced.
 */
export type AuditEntityType = "REQUIREMENT" | "MAPPING" | "EVIDENCE_LOG"

/**
 * The strongly-typed JSONB changes payload stored in audit_logs.changes.
 * before is null for CREATE operations; after is null for DELETE operations.
 */
export type AuditChangesPayload = {
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}
