// omnis-ui/app/dashboard/page.tsx
// FDA Assurance Dashboard — Command Center Hub
//
// React Server Component. Fetches ALL evidence_logs + ai_compliance_insights
// at request time and delegates rendering to <DashboardClient>.
//
// Layout:
//   ┌──────────────────────────────────────────────────────────────┐
//   │  Page header: breadcrumb left │ IEC compliance badge right   │
//   ├──────────────────────────────────────────────────────────────┤
//   │  Bento row: [Total Executions] [Malfunction Vol.] [Fail %]   │
//   ├────────────────────────────────┬─────────────────────────────┤
//   │  Evidence Log - Traffic Light  │  Live System Telemetry      │
//   │  Matrix (lg:col-span-2)        │  (lg:col-span-1)            │
//   └────────────────────────────────┴─────────────────────────────┘
//
// The DashboardHeader (logo, audit logs link, settings, role badge) has been
// removed from this page. Logo + nav live in AppSidebar. Settings + role badge
// live in the sidebar footer. Audit Logs is a sidebar nav item.
//
// force-dynamic: disables Next.js static/ISR caching.
export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { Activity } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { adminClient } from "@/utils/supabase/admin";
import {
  DashboardClient,
  type DashboardRow,
} from "@/components/dashboard-client";
import { TriageBadge } from "@/components/triage-badge";
import { getPendingCount } from "@/app/dashboard/triage/actions";

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
// Data fetching
// ---------------------------------------------------------------------------

async function fetchAllLogs(): Promise<DashboardRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await supabase
    .from("users")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile?.org_id) return [];
  const orgId: string = profile.org_id;

  let allLogs: EvidenceLogRow[] = [];
  let from = 0;
  const batchSize = 1000;

  while (true) {
    const { data: batch, error } = await adminClient
      .from("evidence_logs")
      .select(
        "log_id, execution_timestamp, execution_status, raw_command, event_source, req_id",
      )
      .eq("org_id", orgId)
      .neq("is_deprecated", true)
      .order("execution_timestamp", { ascending: false })
      .range(from, from + batchSize - 1);

    if (error) {
      console.error("[dashboard] evidence_logs error:", error.message);
      break;
    }
    if (!batch || batch.length === 0) break;
    allLogs = allLogs.concat(batch as EvidenceLogRow[]);
    if (batch.length < batchSize) break;
    from += batchSize;
  }

  if (allLogs.length === 0) return [];

  const logIds = allLogs.map((l) => l.log_id);
  let allInsights: AiInsightRow[] = [];

  for (let i = 0; i < logIds.length; i += 500) {
    const chunk = logIds.slice(i, i + 500);
    const { data: insights, error: insightsError } = await adminClient
      .from("ai_compliance_insights")
      .select("log_id, ai_test_suite, ai_result_summary, ai_confidence_score")
      .in("log_id", chunk);

    if (insightsError) {
      console.error("[dashboard] ai_compliance_insights error:", insightsError.message);
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
      testSuite: insight?.ai_test_suite ?? log.raw_command ?? log.event_source,
      rawCommand: log.raw_command ?? log.event_source ?? "",
      executionStatus: log.execution_status,
      aiSummary,
      severity: mapSeverity(aiSummary),
      reqId: log.req_id ?? null,
      eventSource: log.event_source ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <div className="w-full">
      <div className="h-12 w-64 animate-pulse rounded bg-zinc-200 mb-4" />
      <div className="h-96 w-full animate-pulse rounded bg-zinc-100" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard content — async RSC
// ---------------------------------------------------------------------------

async function DashboardContent({
  initialViewMode,
}: {
  initialViewMode: "grouped" | "flat";
}) {
  const rows = await fetchAllLogs();

  return (
    <div className="w-full">
      <DashboardClient allRows={rows} initialViewMode={initialViewMode} previewLimit={10} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Minimal page header — breadcrumb + compliance badge
//
// The logo lives in AppSidebar. Settings and role badge live in the sidebar
// footer. This bar is intentionally lean: page context left, badge right.
// ---------------------------------------------------------------------------

async function PageHeader() {
  // Resolve role server-side to surface the triage badge on desktop.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let role: string = "developer";
  let pendingCount = 0;

  if (user) {
    const { data: profile } = await adminClient
      .from("users")
      .select("org_id")
      .eq("user_id", user.id)
      .single();

    if (profile?.org_id) {
      const { data: roleRow } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("org_id", profile.org_id)
        .single();
      role = roleRow?.role ?? "developer";

      const { count } = await getPendingCount();
      pendingCount = count ?? 0;
    }
  }

  return (
    // h-[72px] matches the sidebar logo header height exactly so both
    // header bars form a single unbroken horizontal baseline across the viewport.
    // The header itself is full-width. The breadcrumb is constrained to
    // .dashboard-content-width (flush left). The IEC badge sits at the true
    // right edge of the viewport (outside the content width cap).
    <header className="h-[72px] flex items-center border-b border-zinc-200 bg-white w-full pr-6">
      {/* Left: breadcrumb — constrained to dashboard content width */}
      <div className="dashboard-content-width pl-8 flex items-center">
        <div className="flex-1">
          <h1 className="text-sm font-semibold text-zinc-900">
            Dashboard
          </h1>
          <p className="mt-0.5 text-xs text-zinc-400">
            Evidence Log · Command Center
          </p>
        </div>
      </div>

      {/* Right: compliance badge + triage badge — pushed to viewport right edge */}
      <div className="ml-auto flex items-center gap-3 shrink-0">
        <span className="hidden md:inline-flex items-center gap-2 rounded border border-zinc-200 bg-zinc-50 px-3 py-1.5 select-none">
          <Activity className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-xs font-medium text-zinc-600">
            IEC 62304 · 21 CFR Part 11
          </span>
        </span>
        {/* Triage badge — visible desktop; mobile version is in DashboardShell */}
        <div className="hidden lg:block">
          <TriageBadge count={pendingCount} role={role} />
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Page export
// ---------------------------------------------------------------------------

interface DashboardPageProps {
  searchParams: Promise<{ view?: string }>;
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const { view } = await searchParams;
  const initialViewMode: "grouped" | "flat" =
    view === "list" ? "flat" : "grouped";

  return (
    // No min-h-screen here — the shell (h-screen overflow-hidden) controls
    // viewport height. This div fills the entire scrollable column height.
    <div className="flex flex-col min-h-full bg-zinc-50">
      {/* Minimal in-page header: breadcrumb + compliance badge */}
      <PageHeader />

      {/* Main content — fills all available width up to 1600px.
          Padding is applied directly so the grid columns stretch
          to the full width of the content area on large monitors. */}
      <div className="w-full px-8 py-8">
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardContent initialViewMode={initialViewMode} />
        </Suspense>
      </div>
    </div>
  );
}
