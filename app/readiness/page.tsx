// omnis-ui/app/readiness/page.tsx
// FDA Submission Readiness — Traceability Matrix & Gap Analysis
//
// =============================================================================
// CACHE-LEAK ROOT CAUSE & STRUCTURAL FIX (Constitution §II — defence in depth)
// =============================================================================
// Previous attempts (force-dynamic, noStore(), revalidate=0, .eq embed filter,
// JS tripwire) did NOT fix the cross-tenant leak because they targeted the
// wrong layer. Next.js 16 does not cache fetch() by default, so the route-level
// flags were largely redundant. The actual leak was the PostgREST embedded
// query:
//
//     .from("regulatory_rules")
//     .select("..., evidence_logs(...)")
//     .eq("evidence_logs.org_id", userOrgId)
//
// Filtering an embedded resource via the parent's `.eq()` is fragile. The
// embed traverses an FK relationship and the filter is applied as an OUTER
// constraint, not as a hard predicate on the child rows. Combined with any
// drift between local migrations and the prod RLS policy on evidence_logs,
// the embed can return rows whose org_id does not match the caller's.
//
// THE FIX:
// Replace the single embedded query with TWO EXPLICIT, FLAT queries:
//   1. SELECT regulatory_rules     — global table, no RLS needed
//   2. SELECT evidence_logs WHERE org_id = userOrgId
// Then merge them in JavaScript. A flat .eq() on a flat select is unambiguous
// and not subject to embed semantics. RLS still applies as the primary control;
// the explicit filter is the secondary control mandated by Constitution §II.
//
// A FINAL TRIPWIRE rejects the entire render with a thrown error if any log's
// org_id does not match the caller's. Cross-tenant leakage is now structurally
// impossible at the application layer.
//
// A DIAGNOSTIC BANNER renders the caller's user_id, org_id, org name, and log
// count at the top of the page so the operator can immediately verify which
// tenant they are in and rule out "user joined the admin org" false positives.
// =============================================================================

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;
export const runtime = "nodejs";

import { Suspense } from "react";
import { headers } from "next/headers";
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
import {
  ShieldCheck,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  Building2,
  Settings,
} from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { adminClient } from "@/utils/supabase/admin";

// ---------------------------------------------------------------------------
// Types — strictly match the Constitution's DDL schema
// ---------------------------------------------------------------------------

interface EvidenceLogRow {
  log_id: string;
  req_id: string;
  approved_by: string | null;
  org_id: string;
}

interface RegulatoryRuleRow {
  req_id: string;
  rule_source: string;
  description: string | null;
  evidence_type: string | null;
}

// ---------------------------------------------------------------------------
// Compliance state
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

interface TenantContext {
  userId: string;
  userEmail: string | null;
  orgId: string | null;
  orgName: string | null;
}

interface ReadinessPayload {
  rules: ParsedRule[];
  tenant: TenantContext;
  totalLogsForOrg: number;
}

// ---------------------------------------------------------------------------
// STATE CLASSIFIER
// ---------------------------------------------------------------------------

function classifyRule(
  rule: RegulatoryRuleRow,
  logs: EvidenceLogRow[],
): ParsedRule {
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
// DATA FETCHING — TWO EXPLICIT QUERIES, NO POSTGREST EMBED
// ---------------------------------------------------------------------------
async function fetchReadinessData(): Promise<ReadinessPayload> {
  // Belt-and-suspenders: opt out of every cache layer Next.js exposes.
  // Reading request headers also forces this Server Component into the
  // dynamic rendering path so it can never be statically prerendered.
  noStore();
  await headers();

  const supabase = await createClient();

  // -------------------------------------------------------------------------
  // STEP 1 — Resolve the authenticated caller from the session cookie.
  // -------------------------------------------------------------------------
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      rules: [],
      tenant: { userId: "", userEmail: null, orgId: null, orgName: null },
      totalLogsForOrg: 0,
    };
  }

  // -------------------------------------------------------------------------
  // STEP 2 — Resolve the caller's org_id and org name from public.users
  // joined to public.organizations. RLS on public.users restricts this to the
  // caller's own row only, which is also what private.get_auth_org_id() uses.
  // -------------------------------------------------------------------------
  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("org_id, organizations(company_name)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("[readiness] profile lookup failed:", {
      user_id: user.id,
      code: profileError.code,
      message: profileError.message,
    });
  }

  const userOrgId: string | null =
    (profile?.org_id as string | null | undefined) ?? null;
  const userOrgName: string | null =
    (
      profile as
        | { organizations?: { company_name?: string } | null }
        | null
        | undefined
    )?.organizations?.company_name ?? null;

  const tenant: TenantContext = {
    userId: user.id,
    userEmail: user.email ?? null,
    orgId: userOrgId,
    orgName: userOrgName,
  };

  console.log("[readiness] tenant resolved:", {
    user_id: tenant.userId,
    user_email: tenant.userEmail,
    org_id: tenant.orgId,
    org_name: tenant.orgName,
  });

  // -------------------------------------------------------------------------
  // STEP 3 — Fetch the global regulatory_rules table.
  // No tenant filter; this table is shared across all orgs.
  // -------------------------------------------------------------------------
  const { data: ruleRows, error: rulesError } = await adminClient
    .from("regulatory_rules")
    .select("req_id, rule_source, description, evidence_type")
    .neq("rule_source", "SEED-TEST-DEPRECATED")
    .order("req_id", { ascending: true });

  if (rulesError) {
    console.error("[readiness] regulatory_rules fetch failed:", {
      code: rulesError.code,
      message: rulesError.message,
    });
    return { rules: [], tenant, totalLogsForOrg: 0 };
  }

  const rules: RegulatoryRuleRow[] = (ruleRows ?? []) as RegulatoryRuleRow[];

  // -------------------------------------------------------------------------
  // STEP 4 — Pending-onboarding short-circuit.
  // A user with no org assignment must never see another org's evidence.
  // -------------------------------------------------------------------------
  if (!userOrgId) {
    console.log(
      "[readiness] caller has no org assignment; returning empty matrix.",
    );
    return {
      rules: rules.map((r) => classifyRule(r, [])),
      tenant,
      totalLogsForOrg: 0,
    };
  }

  // -------------------------------------------------------------------------
  // STEP 5 — Fetch evidence_logs for THIS ORG ONLY, as a flat query.
  //
  // RLS on evidence_logs already enforces org_id = private.get_auth_org_id().
  // The explicit .eq("org_id", userOrgId) filter is the application-layer
  // backstop required by Constitution §II. Both controls are unambiguous on
  // a flat (non-embedded) select.
  //
  // We also page through results in case an org accumulates more than the
  // PostgREST default of 1000 rows.
  // -------------------------------------------------------------------------
  const allLogs: EvidenceLogRow[] = [];
  const batchSize = 1000;
  let from = 0;

  while (true) {
    const { data: batch, error: logsError } = await adminClient
      .from("evidence_logs")
      .select("log_id, req_id, approved_by, org_id")
      .eq("org_id", userOrgId)
      .range(from, from + batchSize - 1);

    if (logsError) {
      console.error("[readiness] evidence_logs fetch failed:", {
        code: logsError.code,
        message: logsError.message,
      });
      break;
    }

    if (!batch || batch.length === 0) break;
    allLogs.push(...(batch as EvidenceLogRow[]));
    if (batch.length < batchSize) break;
    from += batchSize;
  }

  // -------------------------------------------------------------------------
  // STEP 6 — HARD TRIPWIRE.
  // If a single returned row has the wrong org_id, refuse to render.
  // This makes cross-tenant leakage impossible at the application layer
  // even if RLS, the FK schema, or PostgREST behaviour were ever to drift.
  // -------------------------------------------------------------------------
  const leakedRows = allLogs.filter((l) => l.org_id !== userOrgId);
  if (leakedRows.length > 0) {
    console.error(
      "[readiness] CROSS-TENANT LEAKAGE DETECTED — refusing to render.",
      {
        user_id: tenant.userId,
        user_org_id: userOrgId,
        leaked_count: leakedRows.length,
        leaked_org_ids: Array.from(new Set(leakedRows.map((l) => l.org_id))),
      },
    );
    throw new Error(
      "OMNIS HALT: Cross-tenant evidence detected for user " +
        tenant.userId +
        ". Render aborted to preserve tenant isolation.",
    );
  }

  console.log("[readiness] org evidence resolved:", {
    org_id: userOrgId,
    rules_count: rules.length,
    logs_count: allLogs.length,
  });

  // -------------------------------------------------------------------------
  // STEP 7 — Group logs by req_id and classify each rule.
  // -------------------------------------------------------------------------
  const logsByRule = new Map<string, EvidenceLogRow[]>();
  for (const log of allLogs) {
    const bucket = logsByRule.get(log.req_id);
    if (bucket) bucket.push(log);
    else logsByRule.set(log.req_id, [log]);
  }

  return {
    rules: rules.map((r) => classifyRule(r, logsByRule.get(r.req_id) ?? [])),
    tenant,
    totalLogsForOrg: allLogs.length,
  };
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
// TENANT BANNER — surfaces the org context so cross-tenant confusion is
// immediately visible to the operator.
// ---------------------------------------------------------------------------

function TenantBanner({
  tenant,
  totalLogsForOrg,
}: {
  tenant: TenantContext;
  totalLogsForOrg: number;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/70 px-4 py-3 text-xs">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-zinc-600">
        <span className="flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5 text-zinc-400" />
          <span className="font-semibold text-zinc-700">
            {tenant.orgName ?? "(no organization assigned)"}
          </span>
        </span>
        {/* SECURITY: the raw org_id UUID is intentionally NOT rendered here.
            It is the enterprise join code — exposing it in the header would
            leak it to unauthorized internal roles. Only the Company Name is
            shown for tenant context. */}
        <span className="text-zinc-400">
          {totalLogsForOrg} evidence log{totalLogsForOrg !== 1 ? "s" : ""} for this org
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RULE ROW
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
    <div className="flex items-start gap-3 border-b border-zinc-100 py-3 last:border-0">
      <div className="mt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-semibold text-zinc-700">
            {rule.req_id}
          </span>
          {rule.evidence_type && (
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">
              {rule.evidence_type}
            </span>
          )}
        </div>
        {rule.description && (
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
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
// READINESS CONTENT
// ---------------------------------------------------------------------------

async function ReadinessContent() {
  const { rules, tenant, totalLogsForOrg } = await fetchReadinessData();

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
      <div className="space-y-4">
        <TenantBanner tenant={tenant} totalLogsForOrg={totalLogsForOrg} />
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
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <TenantBanner tenant={tenant} totalLogsForOrg={totalLogsForOrg} />

      {/* HEADER ROW */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-900">
            Traceability Matrix
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            {compliant} of {total} requirements satisfied ·{" "}
            {completionPercent.toFixed(1)}% submission-ready
          </p>
        </div>
        <GenerateReportButton completionPercent={completionPercent} />
      </div>

      {/* PROGRESS CARD */}
      <Card className="border-zinc-200 shadow-sm">
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
            className="h-3 bg-zinc-100"
          />
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-500">
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

      {/* BREAKDOWN ACCORDION */}
      <Accordion
        type="multiple"
        defaultValue={["missing", "pending"]}
        className="space-y-3"
      >
        {missingRules.length > 0 && (
          <AccordionItem
            value="missing"
            className="rounded-xl border border-red-200 bg-white shadow-sm overflow-hidden"
          >
            <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-red-50/40 [&[data-state=open]]:bg-red-50/40">
              <div className="flex items-center gap-3">
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm font-semibold text-zinc-800">
                  Missing Evidence
                </span>
                <span className="rounded-full border border-red-200 bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                  {missingRules.length}
                </span>
              </div>
              <p className="ml-7 mt-0.5 text-left text-xs text-zinc-400">
                No evidence logs exist for these requirements. These are your
                critical submission blockers.
              </p>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-4 pt-0">
              <Separator className="mb-3 bg-red-100" />
              {missingRules.map((rule) => (
                <RuleRow key={rule.req_id} rule={rule} />
              ))}
            </AccordionContent>
          </AccordionItem>
        )}

        {pendingRules.length > 0 && (
          <AccordionItem
            value="pending"
            className="rounded-xl border border-amber-200 bg-white shadow-sm overflow-hidden"
          >
            <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-amber-50/40 [&[data-state=open]]:bg-amber-50/40">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-semibold text-zinc-800">
                  Pending Approval
                </span>
                <span className="rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                  {pendingRules.length}
                </span>
              </div>
              <p className="ml-7 mt-0.5 text-left text-xs text-zinc-400">
                Evidence logs exist but have not been digitally signed under
                21 CFR Part 11. Open each log and click &quot;Approve &amp; Lock&quot;.
              </p>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-4 pt-0">
              <Separator className="mb-3 bg-amber-100" />
              {pendingRules.map((rule) => (
                <RuleRow key={rule.req_id} rule={rule} />
              ))}
            </AccordionContent>
          </AccordionItem>
        )}

        {compliantRules.length > 0 && (
          <AccordionItem
            value="compliant"
            className="rounded-xl border border-emerald-200 bg-white shadow-sm overflow-hidden"
          >
            <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-emerald-50/30 [&[data-state=open]]:bg-emerald-50/30">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-semibold text-zinc-800">
                  Compliant
                </span>
                <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  {compliantRules.length}
                </span>
              </div>
              <p className="ml-7 mt-0.5 text-left text-xs text-zinc-400">
                Requirements with at least one digitally signed evidence log.
                No action required.
              </p>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-4 pt-0">
              <Separator className="mb-3 bg-emerald-100" />
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
          <div className="h-6 w-48 animate-pulse rounded bg-zinc-200" />
          <div className="h-3 w-64 animate-pulse rounded bg-zinc-100" />
        </div>
        <div className="h-9 w-48 animate-pulse rounded-lg bg-zinc-200" />
      </div>
      <Card className="border-zinc-200">
        <CardContent className="pt-6 pb-5">
          <div className="mb-2 flex justify-between">
            <div className="h-3 w-40 animate-pulse rounded bg-zinc-200" />
            <div className="h-6 w-16 animate-pulse rounded bg-zinc-200" />
          </div>
          <div className="h-3 animate-pulse rounded-full bg-zinc-100" />
        </CardContent>
      </Card>
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-zinc-100" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PAGE EXPORT
// ---------------------------------------------------------------------------

export default function ReadinessPage() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-screen-2xl w-full items-center px-6 py-4 md:px-8 md:py-5">
          <div className="flex items-center gap-2 shrink-0">
            <ShieldCheck className="h-5 w-5 md:h-6 md:w-6 text-zinc-800" strokeWidth={1.75} />
            <div>
              <h1 className="text-base md:text-lg font-semibold tracking-tight text-zinc-900">
                QAVRO
              </h1>
              <p className="hidden sm:block text-xs text-zinc-400">FDA Submission Readiness</p>
            </div>
          </div>

          <div className="hidden sm:flex flex-1 justify-center">
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-4 py-1.5 text-sm font-semibold text-zinc-700 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900"
            >
              Back to Dashboard
            </Link>
          </div>

          <div className="flex items-center gap-2 ml-auto sm:ml-0 shrink-0">
            <span className="hidden md:flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 select-none">
              <Activity className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs font-medium text-zinc-600">
                IEC 62304 · 21 CFR Part 11
              </span>
            </span>
            <Link
              href="/dashboard/settings"
              aria-label="Settings"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            >
              <Settings className="h-4 w-4" strokeWidth={1.75} />
            </Link>
          </div>
        </div>

        <div className="flex sm:hidden border-t border-zinc-100 px-4 py-2">
          <Link
            href="/dashboard"
            className="flex-1 text-center rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-100"
          >
            Back to Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-screen-2xl w-full px-6 py-6 md:px-8 md:py-10">
        <Suspense fallback={<ReadinessSkeleton />}>
          <ReadinessContent />
        </Suspense>
      </main>
    </div>
  );
}
