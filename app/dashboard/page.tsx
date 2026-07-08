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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Activity, Cpu, Wifi, WifiOff } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { adminClient } from "@/utils/supabase/admin";
import {
  DashboardClient,
  TelemetryCards,
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
    <>
      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="border-zinc-200">
            <CardHeader className="pb-2">
              <div className="h-3 w-24 animate-pulse rounded bg-zinc-200" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 animate-pulse rounded bg-zinc-200" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 h-64 animate-pulse rounded bg-zinc-100" />
        <div className="lg:col-span-1 min-h-96 animate-pulse rounded bg-zinc-100" />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Live System Telemetry placeholder card
// ---------------------------------------------------------------------------

function LiveSystemTelemetry() {
  return (
    <Card className="border-zinc-200 bg-white min-h-[500px] flex flex-col">
      <CardHeader className="border-b border-zinc-100 pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-zinc-800">
            Live System Telemetry
          </CardTitle>
          <span className="inline-flex items-center gap-1.5 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Real-time ingestion pipeline health and system signals
        </p>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4 pt-5">
        {[
          {
            icon: Cpu,
            label: "Ingestion Pipeline",
            status: "Operational",
            color: "text-emerald-600",
            bg: "bg-emerald-50",
            border: "border-emerald-200",
          },
          {
            icon: Wifi,
            label: "Bedrock AI Engine",
            status: "Connected",
            color: "text-emerald-600",
            bg: "bg-emerald-50",
            border: "border-emerald-200",
          },
          {
            icon: Activity,
            label: "Evidence Ledger",
            status: "Writing",
            color: "text-sky-600",
            bg: "bg-sky-50",
            border: "border-sky-200",
          },
          {
            icon: WifiOff,
            label: "DICOM Connector",
            status: "Standby",
            color: "text-zinc-500",
            bg: "bg-zinc-50",
            border: "border-zinc-200",
          },
        ].map(({ icon: Icon, label, status, color, bg, border }) => (
          <div
            key={label}
            className="flex items-center justify-between rounded border border-zinc-100 bg-zinc-50 px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded ${bg} border ${border}`}
              >
                <Icon className={`h-4 w-4 ${color}`} strokeWidth={1.75} />
              </div>
              <span className="text-sm font-medium text-zinc-700">{label}</span>
            </div>
            <span
              className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${bg} ${border} ${color}`}
            >
              {status}
            </span>
          </div>
        ))}

        <div className="mt-2 flex flex-1 flex-col items-center justify-center rounded border border-dashed border-zinc-200 py-10 text-center">
          <Activity className="mb-3 h-8 w-8 text-zinc-300" strokeWidth={1.5} />
          <p className="text-xs font-medium text-zinc-400">
            Live signal stream coming soon
          </p>
          <p className="mt-1 text-[11px] text-zinc-300">
            WebSocket pipeline under construction
          </p>
        </div>
      </CardContent>
    </Card>
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
    <>
      {/* Bento metric row */}
      <TelemetryCards rows={rows} />

      {/* 2/3 + 1/3 content split — w-full fills the max-w-screen-2xl boundary */}
      <div className="w-full grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 min-w-0">
          <DashboardClient allRows={rows} initialViewMode={initialViewMode} previewLimit={10} />
        </div>
        <div className="lg:col-span-1">
          <LiveSystemTelemetry />
        </div>
      </div>
    </>
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
    <header className="h-[72px] flex items-center border-b border-zinc-200 bg-white">
      <div className="w-full px-8">
        <div className="flex items-center justify-between">
          {/* Left: page breadcrumb */}
          <div>
            <h1 className="text-sm font-semibold text-zinc-900">
              Dashboard
            </h1>
            <p className="mt-0.5 text-xs text-zinc-400">
              Evidence Log · Command Center
            </p>
          </div>

          {/* Right: compliance badge + triage badge (desktop only) */}
          <div className="flex items-center gap-3">
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
    <div className="min-h-screen bg-zinc-50">
      {/* Minimal in-page header: breadcrumb + compliance badge */}
      <PageHeader />

      {/* Main content — max-w-screen-2xl for a spacious Command Center layout */}
      <div className="mx-auto max-w-screen-2xl w-full px-8 py-8">
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardContent initialViewMode={initialViewMode} />
        </Suspense>
      </div>
    </div>
  );
}
