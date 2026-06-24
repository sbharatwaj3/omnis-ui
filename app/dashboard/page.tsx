// omnis-ui/app/dashboard/page.tsx
// FDA Assurance Dashboard — Evidence Log Traffic Light Matrix
//
// React Server Component. Fetches ALL evidence_logs + ai_compliance_insights
// at request time and passes them to <DashboardClient> for client-side
// filtering, pagination, and master-detail drawer rendering.
//
// force-dynamic: disables Next.js static/ISR caching so every request fetches
// a fresh snapshot from Supabase. Required after any DB backfill so the page
// never serves a stale cached empty state.
export const dynamic = "force-dynamic";

import { Suspense } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ShieldCheck,
  Activity,
  ClipboardList,
  Brain,
  ShieldAlert,
  Table2,
} from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { adminClient } from "@/utils/supabase/admin";
import { SettingsMenu } from "@/components/settings-menu";
import { RoleBadge } from "@/components/role-badge";
import { DashboardClient, type DashboardRow } from "@/components/dashboard-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EvidenceLogRow {
  log_id: string;
  execution_timestamp: string;
  execution_status: string;
  raw_command: string;
  event_source: string;
  req_id: string;
}

interface AiInsightRow {
  log_id: string;
  ai_test_suite: string | null;
  ai_result_summary: string | null;
  ai_confidence_score: number | null;
}

function mapSeverity(aiSummary: string | null): DashboardRow["severity"] {
  if (!aiSummary) return "Pending";
  if (/critical|failure|anomaly/i.test(aiSummary)) return "Critical";
  return "Clear";
}

// ---------------------------------------------------------------------------
// Data fetching — no row cap; all logs fetched for client-side filtering
// ---------------------------------------------------------------------------

async function fetchAllLogs(): Promise<DashboardRow[]> {
  // Step 1: Verify the authenticated session with the anon-key session client.
  // This is the ONLY call that needs the session client — it confirms the user
  // is logged in and resolves their identity server-side.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Step 2: Resolve org_id via the session client (RLS on users table uses
  // auth.uid() = user_id directly, so this is unaffected by the RBAC policy).
  const { data: profile } = await supabase
    .from("users")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile?.org_id) return [];
  const orgId: string = profile.org_id;

  // Step 3: All DATA queries use adminClient (service role) to bypass the
  // RBAC-gated RLS policy on evidence_logs and ai_compliance_insights.
  //
  // WHY: The RBAC migration (20260616) replaced the simple org-only SELECT
  // policy with one that requires private.get_auth_role() IS NOT NULL. That
  // function resolves via user_roles, which requires the authenticated session
  // to satisfy its own RLS SELECT policy. This chain can fail silently for
  // accounts created before RBAC, returning an empty result set with no error.
  //
  // SECURITY: The org_id scoping below ensures a user can only ever read their
  // own org's logs. The user identity is verified in Step 1 above via the
  // session client — we never trust a client-supplied value.

  // Fetch in pages of 1000 to stay within Supabase's default range limit
  let allLogs: EvidenceLogRow[] = [];
  let from = 0;
  const batchSize = 1000;

  while (true) {
    const { data: batch, error } = await adminClient
      .from("evidence_logs")
      .select("log_id, execution_timestamp, execution_status, raw_command, event_source, req_id")
      .eq("org_id", orgId)
      .order("execution_timestamp", { ascending: false })
      .range(from, from + batchSize - 1);

    if (error) {
      console.error("[dashboard] Supabase error fetching evidence_logs:", error.message);
      break;
    }

    if (!batch || batch.length === 0) break;
    allLogs = allLogs.concat(batch as EvidenceLogRow[]);
    if (batch.length < batchSize) break;
    from += batchSize;
  }

  if (allLogs.length === 0) return [];

  const logIds = allLogs.map((l) => l.log_id);

  // Fetch insights in batches (Supabase .in() has a practical limit ~500)
  let allInsights: AiInsightRow[] = [];
  for (let i = 0; i < logIds.length; i += 500) {
    const chunk = logIds.slice(i, i + 500);
    const { data: insights, error: insightsError } = await adminClient
      .from("ai_compliance_insights")
      .select("log_id, ai_test_suite, ai_result_summary, ai_confidence_score")
      .in("log_id", chunk);

    if (insightsError) {
      console.error("[dashboard] Supabase error fetching ai_compliance_insights:", insightsError.message);
    }
    if (insights) allInsights = allInsights.concat(insights as AiInsightRow[]);
  }

  const insightMap = new Map<string, AiInsightRow>();
  for (const insight of allInsights) {
    insightMap.set(insight.log_id, insight);
  }

  return allLogs.map((log) => {
    const insight = insightMap.get(log.log_id) ?? null;
    const aiSummary = insight?.ai_result_summary ?? null;
    return {
      logId: log.log_id,
      rawExecutionTimestamp: log.execution_timestamp,
      executionTime: new Date(log.execution_timestamp).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
      }),
      // testSuite: human-readable label from ai_test_suite if available
      testSuite: insight?.ai_test_suite ?? log.raw_command ?? log.event_source,
      // rawCommand: the original CLI command for the title parser + tooltip
      rawCommand: log.raw_command ?? log.event_source ?? "",
      executionStatus: log.execution_status,
      aiSummary,
      severity: mapSeverity(aiSummary),
      reqId: log.req_id ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Skeleton — shown while the async data fetch streams in
// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="border-zinc-200 shadow-sm">
            <CardHeader className="pb-2">
              <div className="h-3 w-24 animate-pulse rounded bg-zinc-200" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 animate-pulse rounded bg-zinc-200" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-zinc-100" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Dashboard content — async server component, streams into Suspense
// ---------------------------------------------------------------------------

async function DashboardContent() {
  const rows = await fetchAllLogs();
  return (
    <>
      {/* ── Primary Action Cards ──────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Card 1: Compliance Matrix */}
        <Link
          href="/readiness"
          className="group flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white px-5 py-5 shadow-sm transition-all hover:shadow-md hover:border-zinc-300"
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 group-hover:bg-zinc-200 transition-colors">
              <Table2 className="h-4 w-4 text-zinc-700" strokeWidth={1.75} />
            </div>
            <span className="text-sm font-semibold text-zinc-900">Compliance Matrix</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Generate and export traceability reports
          </p>
        </Link>

        {/* Card 2: Requirements */}
        <Link
          href="/dashboard/requirements"
          className="group flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white px-5 py-5 shadow-sm transition-all hover:shadow-md hover:border-zinc-300"
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 group-hover:bg-zinc-200 transition-colors">
              <ClipboardList className="h-4 w-4 text-zinc-700" strokeWidth={1.75} />
            </div>
            <span className="text-sm font-semibold text-zinc-900">Requirements</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Map SRS/SDS to regulatory codes
          </p>
        </Link>

        {/* Card 3: Triage Inbox */}
        <Link
          href="/dashboard/triage"
          className="group flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white px-5 py-5 shadow-sm transition-all hover:shadow-md hover:border-zinc-300"
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 group-hover:bg-amber-100 transition-colors">
              <Brain className="h-4 w-4 text-amber-700" strokeWidth={1.75} />
            </div>
            <span className="text-sm font-semibold text-zinc-900">Triage Inbox</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Review AI-flagged compliance discrepancies
          </p>
        </Link>
      </div>

      {/* ── Metrics cards + evidence log table ───────────────────────── */}
      <DashboardClient allRows={rows} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Page export
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center px-4 py-4 md:px-8 md:py-5">
          {/* Left: logo */}
          <Link href="/dashboard" className="flex items-center gap-2 group shrink-0">
            <ShieldCheck
              className="h-5 w-5 md:h-6 md:w-6 text-zinc-800"
              strokeWidth={1.75}
            />
            <div>
              <h1 className="text-base md:text-lg font-semibold tracking-tight text-zinc-900">
                Omnis RegOps
              </h1>
              <p className="hidden sm:block text-xs text-zinc-400">FDA Assurance Dashboard · Live</p>
            </div>
          </Link>

          {/* Centre: primary nav CTAs — hidden on small phones, shown on sm+ */}
          <div className="hidden sm:flex flex-1 justify-center items-center gap-2">
            <Link
              href="/dashboard/audit-logs"
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-4 py-1.5 text-sm font-semibold text-zinc-800 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50"
            >
              <ShieldAlert className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              Audit Logs
            </Link>
          </div>

          {/* Right: informational badge (hidden on mobile) + role badge + settings */}
          <div className="flex items-center gap-2 ml-auto sm:ml-0 shrink-0">
            <span className="hidden md:flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 select-none">
              <Activity className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs font-medium text-zinc-600">
                IEC 62304 · 21 CFR Part 11
              </span>
            </span>
            <RoleBadge />
            <SettingsMenu />
          </div>
        </div>

        {/* Mobile-only sub-bar: primary nav links */}
        <div className="flex sm:hidden border-t border-zinc-100 px-4 py-2 gap-2">
          <Link
            href="/dashboard/audit-logs"
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-100"
          >
            <ShieldAlert className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            Audit
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10">
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardContent />
        </Suspense>
      </main>
    </div>
  );
}
