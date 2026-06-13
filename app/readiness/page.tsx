// omnis-ui/app/readiness/page.tsx
// FDA Submission Readiness — Traceability Matrix & Gap Analysis
//
// React Server Component. Fetches the full regulatory_rules table and embeds
// the matching evidence_logs rows for each rule using PostgREST's foreign key
// embed syntax. Parses each rule into three compliance states and renders the
// full gap analysis matrix.
//
// CONSTITUTION ALIGNMENT:
// - Uses @supabase/ssr createClient (session-aware, RLS-respecting, anon-key)
// - Strictly matches the DDL schema: regulatory_rules.req_id PK,
//   evidence_logs.req_id FK → regulatory_rules.req_id
// - Compliant state requires approved_by IS NOT NULL (21 CFR Part 11 §11.100)
// - No cross-schema joins — auth.users is never touched here
// - NEVER uses the service_role admin client. Authentication is the user's
//   session cookie carrying their JWT.
//
// SECURITY (defense-in-depth against cross-tenant leakage):
//   1. force-dynamic and unstable_noStore() opt the route out of every layer
//      of Next.js caching, so a previous user's PostgREST response can never
//      be served to a different user.
//   2. After resolving the authenticated user, we explicitly look up the
//      caller's org_id from public.users (the same anchor RLS uses).
//   3. If org_id is NULL (pending onboarding), we short-circuit — the user
//      sees zero evidence and 0% compliance, which is the correct state.
//   4. The embedded evidence_logs(...) foreign-table query is filtered by
//      .eq("evidence_logs.org_id", userOrgId), so even if a server-side RLS
//      policy were misconfigured or removed, the application layer still
//      rejects any row whose org_id does not match the caller's.
//   5. RLS on evidence_logs remains the primary control; this code is the
//      secondary control mandated by Constitution Law II ("never lower the
//      backend's shield").
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { GenerateReportButton } from "@/components/generate-report-button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  ShieldCheck,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
} from "lucide-react";
import { createClient } from "@/utils/supabase/server";

// ---------------------------------------------------------------------------
// Types — strictly match the Constitution's DDL schema
// ---------------------------------------------------------------------------

interface EvidenceLogEmbed {
  log_id: string;
  approved_by: string | null;
}

interface RegulatoryRuleRow {
  req_id: string;
  rule_source: string;
  description: string | null;
  evidence_type: string | null;
  evidence_logs: EvidenceLogEmbed[];
}

// ---------------------------------------------------------------------------
// Compliance state — derived per rule from its embedded evidence_logs
// ---------------------------------------------------------------------------

type ComplianceState = "Compliant" | "Pending Approval" | "Missing";

interface ParsedRule {
  req_id: string;
  rule_source: string;
  description: string | null;
  evidence_type: string | null;
  state: ComplianceState;
  logCount: number;
  approvedCount: number;
}

// ---------------------------------------------------------------------------
// STATE CLASSIFIER
// Compliant:        ≥1 log with approved_by IS NOT NULL  (21 CFR Part 11 signed)
// Pending Approval: ≥1 log but all have approved_by NULL (unsigned evidence)
// Missing:          No evidence_logs at all
// ---------------------------------------------------------------------------

function classifyRule(rule: RegulatoryRuleRow): ParsedRule {
  const logs = rule.evidence_logs ?? [];
  const approvedCount = logs.filter((l) => l.approved_by !== null).length;

  let state: ComplianceState;
  if (logs.length === 0) {
    state = "Missing";
  } else if (approvedCount > 0) {
    state = "Compliant";
  } else {
    state = "Pending Approval";
  }

  return {
    req_id: rule.req_id,
    rule_source: rule.rule_source,
    description: rule.description,
    evidence_type: rule.evidence_type,
    state,
    logCount: logs.length,
    approvedCount,
  };
}

// ---------------------------------------------------------------------------
// DATA FETCHING — RLS + APPLICATION-LAYER ORG FILTERING
// ---------------------------------------------------------------------------
async function fetchReadinessData(): Promise<ParsedRule[]> {
  // Defeat every layer of fetch / route caching. Even with force-dynamic,
  // Next.js can deduplicate fetches within a single render and may reuse a
  // cached PostgREST response if the URL/headers happen to match.
  // noStore() is the strongest opt-out and removes any chance that an admin's
  // earlier response is served to a different user.
  noStore();

  const supabase = await createClient();

  // STEP 1 — Resolve the authenticated user from the session cookie.
  // Anon key + cookie-based JWT only. NO service_role bypass.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // STEP 2 — Resolve the caller's org_id from public.users.
  // This is the same anchor private.get_auth_org_id() uses for RLS, but
  // executed at the application layer for defense-in-depth. RLS on the
  // users table allows a user to read only their own row, so this query
  // also benefits from RLS isolation.
  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("org_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("Supabase error fetching profile org_id:", {
      code: profileError.code,
      message: profileError.message,
      hint: profileError.hint,
    });
    return [];
  }

  const userOrgId: string | null = profile?.org_id ?? null;

  // STEP 3 — Pending-onboarding short-circuit.
  // A user with no org assignment must never see another org's evidence.
  // Return regulatory rules with empty embedded logs so the matrix renders
  // 0% compliance — the correct state until onboarding completes.
  if (!userOrgId) {
    const { data: rulesOnly, error: rulesOnlyError } = await supabase
      .from("regulatory_rules")
      .select("req_id, rule_source, description, evidence_type")
      .neq("rule_source", "SEED-TEST-DEPRECATED")
      .order("req_id", { ascending: true });

    if (rulesOnlyError) {
      console.error("Supabase error fetching regulatory_rules (pending onboarding):", {
        code: rulesOnlyError.code,
        message: rulesOnlyError.message,
        hint: rulesOnlyError.hint,
      });
      return [];
    }

    return (rulesOnlyError ? [] : (rulesOnly ?? [])).map((r) =>
      classifyRule({ ...r, evidence_logs: [] } as RegulatoryRuleRow),
    );
  }

  // STEP 4 — Fetch rules with embedded evidence_logs filtered by org_id.
  //
  // The .eq("evidence_logs.org_id", userOrgId) clause filters the embedded
  // children at the PostgREST layer. Each parent regulatory_rules row is
  // still returned (so "Missing" rules render correctly), but its
  // evidence_logs array contains only rows whose org_id matches the caller.
  //
  // This is the defense-in-depth backstop. RLS on evidence_logs is the
  // primary control; if a policy ever drifts or is dropped, the application
  // filter still prevents cross-tenant leakage.
  const { data, error } = await supabase
    .from("regulatory_rules")
    .select(
      "req_id, rule_source, description, evidence_type, evidence_logs(log_id, approved_by, org_id)",
    )
    .eq("evidence_logs.org_id", userOrgId)
    .neq("rule_source", "SEED-TEST-DEPRECATED")
    .order("req_id", { ascending: true });

  if (error) {
    console.error("Supabase error fetching readiness data:", {
      code: error.code,
      message: error.message,
      hint: error.hint,
    });
    return [];
  }

  // STEP 5 — Final tripwire: drop any embedded log whose org_id doesn't
  // match the caller's. This is paranoid but cheap, and protects against
  // any future PostgREST quirk that might leak rows past the .eq filter.
  const rows = (data as unknown as RegulatoryRuleRow[]).map((rule) => ({
    ...rule,
    evidence_logs: (rule.evidence_logs ?? []).filter(
      (log) => (log as EvidenceLogEmbed & { org_id?: string }).org_id === userOrgId,
    ),
  }));

  return rows.map(classifyRule);
}

// ---------------------------------------------------------------------------
// BADGE COMPONENTS
// ---------------------------------------------------------------------------

function StateBadge({ state }: { state: ComplianceState }) {
  if (state === "Compliant") {
    return (
      <Badge className="border border-emerald-200 bg-emerald-100 font-semibold text-emerald-800 hover:bg-emerald-100">
        ● Compliant
      </Badge>
    );
  }
  if (state === "Pending Approval") {
    return (
      <Badge className="border border-amber-200 bg-amber-100 font-medium text-amber-800 hover:bg-amber-100">
        ● Pending Approval
      </Badge>
    );
  }
  return (
    <Badge className="border border-red-200 bg-red-100 font-semibold text-red-700 hover:bg-red-100">
      ● Missing
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// RULE ROW — single requirement entry inside an accordion section
// ---------------------------------------------------------------------------

function RuleRow({ rule }: { rule: ParsedRule }) {
  const icon =
    rule.state === "Compliant" ? (
      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
    ) : rule.state === "Pending Approval" ? (
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
    ) : (
      <XCircle className="h-4 w-4 shrink-0 text-red-500" />
    );

  return (
    <div className="flex items-start gap-3 border-b border-zinc-100 dark:border-zinc-800 py-3 last:border-0">
      <div className="mt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            {rule.req_id}
          </span>
          {rule.evidence_type && (
            <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
              {rule.evidence_type}
            </span>
          )}
        </div>
        {rule.description && (
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            {rule.description}
          </p>
        )}
        <p className="mt-1 text-[10px] text-zinc-400">
          {rule.logCount} evidence log{rule.logCount !== 1 ? "s" : ""}
          {rule.approvedCount > 0
            ? ` · ${rule.approvedCount} approved`
            : rule.logCount > 0
              ? " · none approved"
              : ""}
          {" · "}
          <span className="text-zinc-400">{rule.rule_source}</span>
        </p>
      </div>
      <div className="shrink-0">
        <StateBadge state={rule.state} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// READINESS CONTENT — the main async Server Component
// ---------------------------------------------------------------------------

async function ReadinessContent() {
  const rules = await fetchReadinessData();

  const total = rules.length;
  const compliant = rules.filter((r) => r.state === "Compliant").length;
  const pending = rules.filter((r) => r.state === "Pending Approval").length;
  const missing = rules.filter((r) => r.state === "Missing").length;
  const completionPercent = total > 0 ? (compliant / total) * 100 : 0;

  const compliantRules = rules.filter((r) => r.state === "Compliant");
  const pendingRules = rules.filter((r) => r.state === "Pending Approval");
  const missingRules = rules.filter((r) => r.state === "Missing");

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <FileText className="mb-4 h-12 w-12 text-zinc-300" />
        <h2 className="text-lg font-semibold text-zinc-700">
          No Regulatory Requirements Found
        </h2>
        <p className="mt-2 max-w-sm text-sm text-zinc-400">
          The regulatory_rules table is empty. Seed it using the seed_db.py
          script in omnis-api/scripts/.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------------------------ */}
      {/* HEADER ROW: completion % + generate button                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Traceability Matrix
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            {compliant} of {total} requirements satisfied ·{" "}
            {completionPercent.toFixed(1)}% submission-ready
          </p>
        </div>
        <GenerateReportButton completionPercent={completionPercent} />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* PROGRESS BAR                                                         */}
      {/* ------------------------------------------------------------------ */}
      <Card className="border-zinc-200 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <CardContent className="pt-6 pb-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              FDA Submission Readiness
            </span>
            <span
              className={`text-2xl font-bold tabular-nums ${
                completionPercent === 100
                  ? "text-emerald-600"
                  : completionPercent >= 50
                    ? "text-amber-600"
                    : "text-red-600"
              }`}
            >
              {completionPercent.toFixed(1)}%
            </span>
          </div>
          <Progress
            value={completionPercent}
            className="h-3 bg-zinc-100 dark:bg-zinc-800"
          />
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              {compliant} Compliant
            </span>
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              {pending} Pending Approval
            </span>
            <span className="flex items-center gap-1.5">
              <XCircle className="h-3.5 w-3.5 text-red-500" />
              {missing} Missing Evidence
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* BREAKDOWN ACCORDION                                                  */}
      {/* ------------------------------------------------------------------ */}
      <Accordion
        type="multiple"
        defaultValue={["missing", "pending"]}
        className="space-y-3"
      >
        {/* MISSING — highest priority gap, open by default */}
        {missingRules.length > 0 && (
          <AccordionItem
            value="missing"
            className="rounded-xl border border-red-200 dark:border-red-900/60 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden"
          >
            <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-red-50/40 dark:hover:bg-red-950/20 [&[data-state=open]]:bg-red-50/40 dark:[&[data-state=open]]:bg-red-950/20">
              <div className="flex items-center gap-3">
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                  Missing Evidence
                </span>
                <span className="rounded-full border border-red-200 dark:border-red-800 bg-red-100 dark:bg-red-950/60 px-2 py-0.5 text-xs font-semibold text-red-700 dark:text-red-400">
                  {missingRules.length}
                </span>
              </div>
              <p className="ml-7 mt-0.5 text-left text-xs text-zinc-400">
                No evidence logs exist for these requirements. These are your
                critical submission blockers.
              </p>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-4 pt-0">
              <Separator className="mb-3 bg-red-100 dark:bg-red-900/40" />
              {missingRules.map((rule) => (
                <RuleRow key={rule.req_id} rule={rule} />
              ))}
            </AccordionContent>
          </AccordionItem>
        )}

        {/* PENDING APPROVAL — evidence exists but unsigned */}
        {pendingRules.length > 0 && (
          <AccordionItem
            value="pending"
            className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden"
          >
            <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-amber-50/40 dark:hover:bg-amber-950/20 [&[data-state=open]]:bg-amber-50/40 dark:[&[data-state=open]]:bg-amber-950/20">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                  Pending Approval
                </span>
                <span className="rounded-full border border-amber-200 dark:border-amber-800 bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-400">
                  {pendingRules.length}
                </span>
              </div>
              <p className="ml-7 mt-0.5 text-left text-xs text-zinc-400">
                Evidence logs exist but have not been digitally signed under
                21 CFR Part 11. Open each log and click "Approve &amp; Lock".
              </p>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-4 pt-0">
              <Separator className="mb-3 bg-amber-100 dark:bg-amber-900/40" />
              {pendingRules.map((rule) => (
                <RuleRow key={rule.req_id} rule={rule} />
              ))}
            </AccordionContent>
          </AccordionItem>
        )}

        {/* COMPLIANT — closed by default to reduce noise */}
        {compliantRules.length > 0 && (
          <AccordionItem
            value="compliant"
            className="rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden"
          >
            <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20 [&[data-state=open]]:bg-emerald-50/30 dark:[&[data-state=open]]:bg-emerald-950/20">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                  Compliant
                </span>
                <span className="rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  {compliantRules.length}
                </span>
              </div>
              <p className="ml-7 mt-0.5 text-left text-xs text-zinc-400">
                Requirements with at least one digitally signed evidence log.
                No action required.
              </p>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-4 pt-0">
              <Separator className="mb-3 bg-emerald-100 dark:bg-emerald-900/40" />
              {compliantRules.map((rule) => (
                <RuleRow key={rule.req_id} rule={rule} />
              ))}
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LOADING SKELETON
// ---------------------------------------------------------------------------

function ReadinessSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-6 w-48 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-3 w-64 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
        </div>
        <div className="h-9 w-48 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <Card className="border-zinc-200 dark:border-zinc-700 dark:bg-zinc-900">
        <CardContent className="pt-6 pb-5">
          <div className="mb-2 flex justify-between">
            <div className="h-3 w-40 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-6 w-16 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          </div>
          <div className="h-3 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800" />
        </CardContent>
      </Card>
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PAGE EXPORT
// ---------------------------------------------------------------------------

export default function ReadinessPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-7xl items-center px-4 py-4 md:px-8 md:py-5">
          {/* Left: logo */}
          <div className="flex items-center gap-2 shrink-0">
            <ShieldCheck className="h-5 w-5 md:h-6 md:w-6 text-zinc-800 dark:text-zinc-200" strokeWidth={1.75} />
            <div>
              <h1 className="text-base md:text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                Omnis RegOps
              </h1>
              <p className="hidden sm:block text-xs text-zinc-400">FDA Submission Readiness</p>
            </div>
          </div>

          {/* Centre: Back to Dashboard — hidden on mobile, shown sm+ */}
          <div className="hidden sm:flex flex-1 justify-center">
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-lg border border-zinc-200 bg-white px-4 py-1.5 text-sm font-semibold text-zinc-800 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-700"
            >
              Back to Dashboard
            </Link>
          </div>

          {/* Right: badge + theme toggle */}
          <div className="flex items-center gap-2 ml-auto sm:ml-0 shrink-0">
            <span className="hidden md:flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 select-none dark:border-zinc-700 dark:bg-zinc-800">
              <Activity className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                IEC 62304 · 21 CFR Part 11
              </span>
            </span>
            <ThemeToggle />
          </div>
        </div>

        {/* Mobile-only sub-bar */}
        <div className="flex sm:hidden border-t border-zinc-100 dark:border-zinc-800 px-4 py-2">
          <Link
            href="/dashboard"
            className="flex-1 text-center rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10">
        <Suspense fallback={<ReadinessSkeleton />}>
          <ReadinessContent />
        </Suspense>
      </main>
    </div>
  );
}
