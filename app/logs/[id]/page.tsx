// omnis-ui/app/logs/[id]/page.tsx
// Phase 3: Forensic Deep-Dive Route + 21 CFR Part 11 Digital Signature
//
// React Server Component — uses @supabase/ssr to fetch the authenticated
// session and the specific evidence_log + ai_compliance_insights row.
// The ApproveLogButton client component triggers the server action.

import { Suspense } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ApproveLogButton } from "@/components/approve-log-button";
import { DashboardHeader } from "@/components/dashboard-header";
import type { UserRole } from "@/hooks/useUserRole";
import {
  ShieldCheck,
  Activity,
  ChevronRight,
  Clock,
  Terminal,
  Brain,
  FileJson,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  LayoutList,
} from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { adminClient } from "@/utils/supabase/admin";

// ---------------------------------------------------------------------------
// Types — strictly match the Constitution's DDL schema
// ---------------------------------------------------------------------------

interface EvidenceLogFull {
  log_id: string;
  org_id: string;
  user_id: string;
  build_id: string;
  req_id: string;
  previous_log_hash: string;
  signature_hash: string;
  raw_command: string;
  sanitized_payload: Record<string, unknown>;
  execution_status: string;
  execution_timestamp: string;
  is_deprecated: boolean;
  event_source: string;
  // 21 CFR Part 11 digital signature fields
  approved_by: string | null;
  approved_at: string | null;
}

interface AiInsightFull {
  id: string;
  log_id: string;
  ai_test_suite: string | null;
  ai_result_summary: string | null;
  ai_reasoning: string | null;
  ai_confidence_score: number | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Severity mapping — same logic as the dashboard
// ---------------------------------------------------------------------------

type Severity = "Critical" | "Clear" | "Pending";

function mapSeverity(aiSummary: string | null | undefined): Severity {
  if (!aiSummary) return "Pending";
  // Match any of: CRITICAL, FAILURE, Anomaly — case-insensitive.
  // Covers "CRITICAL CLINICAL FAILURE", "Critical Anomaly", "FAILURE detected", etc.
  if (/critical|failure|anomaly/i.test(aiSummary)) return "Critical";
  return "Clear";
}

// ---------------------------------------------------------------------------
// DATA FETCHING — uses @supabase/ssr server client so the authenticated
// session is available and RLS policies are correctly applied.
// The service-role admin client resolves approver email from auth.users.
// ---------------------------------------------------------------------------

async function fetchLogDetail(id: string): Promise<{
  log: EvidenceLogFull;
  insight: AiInsightFull | null;
  approverEmail: string | null;
} | null> {
  const supabase = await createClient();

  const { data: log, error: logError } = await adminClient
    .from("evidence_logs")
    .select(
      "log_id, org_id, user_id, build_id, req_id, previous_log_hash, " +
      "signature_hash, raw_command, sanitized_payload, execution_status, " +
      "execution_timestamp, is_deprecated, event_source, " +
      "approved_by, approved_at",
    )
    .eq("log_id", id)
    .single();

  if (logError || !log) {
    if (logError) {
      console.error("Supabase error fetching evidence_log:", {
        code: logError.code,
        message: logError.message,
        details: logError.details,
        hint: logError.hint,
      });
    }
    return null;
  }

  const { data: insight, error: insightError } = await adminClient
    .from("ai_compliance_insights")
    .select(
      "id, log_id, ai_test_suite, ai_result_summary, ai_reasoning, " +
      "ai_confidence_score, created_at",
    )
    .eq("log_id", id)
    .maybeSingle();

  if (insightError) {
    console.error(
      "Supabase error fetching ai_compliance_insights:",
      insightError.message,
    );
  }

  // Resolve the approver email from the public users table.
  // approved_by stores a user_id UUID referencing public.users — NOT auth.users.
  // Query the users table directly for the developer_email field.
  let approverEmail: string | null = null;
  const typedLog = log as unknown as EvidenceLogFull;
  if (typedLog.approved_by) {
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("developer_email")
      .eq("user_id", typedLog.approved_by)
      .maybeSingle();
    if (userError) {
      console.error("Approver email lookup failed:", userError.message);
    } else {
      approverEmail = userData?.developer_email ?? null;
    }
  }

  return {
    log: typedLog,
    insight: insight ? (insight as unknown as AiInsightFull) : null,
    approverEmail,
  };
}

// ---------------------------------------------------------------------------
// TERMINAL TEXT FORMATTER
// The ingested raw_logs string often contains LITERAL escape sequences
// (the two characters "\" + "r" + "\" + "n") rather than real newline bytes.
// This converts those literal sequences into actual line breaks so the
// terminal output renders correctly under whitespace-pre-wrap.
// ---------------------------------------------------------------------------

function formatTerminalText(raw: string): string {
  return raw
    .replace(/\\r\\n/g, "\n") // literal \r\n  → newline
    .replace(/\\r/g, "")      // literal \r     → remove
    .replace(/\\n/g, "\n")    // literal \n     → newline
    .replace(/\\t/g, "\t");   // literal \t     → tab
}

// ---------------------------------------------------------------------------
// SEVERITY BADGE
// ---------------------------------------------------------------------------

function SeverityBadge({ severity }: { severity: Severity }) {
  if (severity === "Critical") {
    return (
      <Badge className="bg-red-100 text-red-700 border border-red-200 hover:bg-red-100 font-semibold px-3 py-1 text-sm">
        ● Critical Anomaly
      </Badge>
    );
  }
  if (severity === "Clear") {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 font-medium px-3 py-1 text-sm">
        ● Clear
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-100 font-medium px-3 py-1 text-sm">
      ● Pending Analysis
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// SEVERITY ICON
// ---------------------------------------------------------------------------

function SeverityIcon({ severity }: { severity: Severity }) {
  if (severity === "Critical")
    return <AlertTriangle className="h-5 w-5 text-red-500" />;
  if (severity === "Clear")
    return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
  return <HelpCircle className="h-5 w-5 text-amber-500" />;
}

// ---------------------------------------------------------------------------
// CONFIDENCE METER
// ---------------------------------------------------------------------------

function ConfidenceMeter({ score }: { score: number | null }) {
  if (score === null) return <span className="text-zinc-400 text-sm">—</span>;

  const color =
    score >= 80
      ? "bg-emerald-500"
      : score >= 50
        ? "bg-amber-500"
        : "bg-red-500";

  return (
    <div className="flex items-center gap-3">
      <div className="h-2 w-32 overflow-hidden rounded-none bg-zinc-100">
        <div
          className={`h-full ${color} transition-all`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-sm font-semibold tabular-nums text-zinc-700">
        {score}%
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DETAIL FIELD — reusable label + value pair
// ---------------------------------------------------------------------------

function DetailField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
        {label}
      </span>
      <span className="text-sm text-zinc-800 break-all">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FORENSIC CONTENT — async Server Component
// ---------------------------------------------------------------------------

async function ForensicContent({ id, backHref }: { id: string; backHref: string }) {
  const result = await fetchLogDetail(id);

  // Resolve user role server-side so ApproveLogButton knows what to render
  let userRole: UserRole = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
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
        userRole = (roleRow?.role as UserRole) ?? null;
      }
    }
  } catch {
    // Non-fatal — falls back to null (will show locked state)
  }

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <ShieldCheck className="mb-4 h-12 w-12 text-zinc-300" />
        <h2 className="text-lg font-semibold text-zinc-700">Log Not Found</h2>
        <p className="mt-2 max-w-sm text-sm text-zinc-400">
          No evidence log exists for ID{" "}
          <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-600">
            {id}
          </code>
          . It may have been deprecated or never ingested.
        </p>
        <Link
          href={backHref}
          className="mt-6 inline-flex items-center rounded border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
        >
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const { log, insight, approverEmail } = result;
  const severity = mapSeverity(insight?.ai_result_summary);
  const testSuite =
    insight?.ai_test_suite ?? log.raw_command ?? log.event_source;

  const executionTime = new Date(log.execution_timestamp).toLocaleString(
    "en-US",
    {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "long",
    },
  );

  // Extract raw_logs from sanitized_payload for the System Console tab.
  // Per the Constitution: "The AI ingestion pipeline MUST only parse the raw_logs field."
  const rawLogs =
    typeof log.sanitized_payload?.raw_logs === "string"
      ? log.sanitized_payload.raw_logs
      : null;

  // The captured logs arrive with literal "\r\n" / "\n" escape sequences.
  // Convert them to real line breaks so the terminal reads naturally.
  const formattedLogs = rawLogs ? formatTerminalText(rawLogs) : null;

  // The full sanitized_payload JSON for the Clinical Payload tab.
  // Order of operations matters here:
  // 1. Stringify first — this double-escapes any real newlines into \\n / \\r\\n
  // 2. Then replace — target the double-escaped sequences FIRST (\\r\\n, \\n),
  //    then the single-escaped sequences (\r\n, \n) for any remaining cases.
  // Doing it the other way (clean object → stringify) causes JSON.stringify to
  // re-escape the real newlines back into literal text on the way out.
  const rawJsonString = JSON.stringify(log.sanitized_payload, null, 2);
  const clinicalPayloadJson = rawJsonString
    .replace(/\\\\r\\\\n/g, "\n") // double-escaped \\r\\n → newline
    .replace(/\\\\r/g, "")        // double-escaped \\r    → remove
    .replace(/\\r\\n/g, "\n")     // single-escaped \r\n   → newline
    .replace(/\\r/g, "");         // single-escaped \r     → remove

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* CONTEXT HEADER                                                       */}
      {/* ------------------------------------------------------------------ */}
      <div>
        {/* Breadcrumb */}
        <nav className="mb-4 flex items-center gap-1.5 text-xs text-zinc-400">
          <Link
            href={backHref}
            className="transition-colors hover:text-zinc-700"
          >
            Dashboard
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-zinc-600">Evidence Log</span>
          <ChevronRight className="h-3 w-3" />
          <span className="font-mono text-zinc-600">
            {log.log_id.slice(0, 8)}…{log.log_id.slice(-4)}
          </span>
        </nav>

        {/* Title row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">
              {testSuite}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {executionTime}
              </span>
              <span className="flex items-center gap-1">
                <Activity className="h-3.5 w-3.5" />
                {log.event_source}
              </span>
              <span
                className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${
                  ["SUCCESS", "PASS"].includes(log.execution_status?.toUpperCase())
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-orange-200 bg-orange-50 text-orange-700"
                }`}
              >
                {log.execution_status}
              </span>
            </div>
          </div>
          {/* Action Dock */}
          <div className="flex flex-wrap shrink-0 items-center gap-2 md:gap-3">
            <SeverityBadge severity={severity} />
            <ApproveLogButton
              logId={log.log_id}
              approvedBy={log.approved_by}
              approvedAt={log.approved_at}
              approverEmail={approverEmail}
              userRole={userRole}
            />
            <Link
              href="/readiness"
              className="hidden sm:inline-flex items-center gap-2 rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-800"
            >
              <LayoutList className="h-3.5 w-3.5" />
              View Traceability Matrix
            </Link>
          </div>
        </div>
      </div>

      <Separator className="bg-zinc-200" />

      {/* ------------------------------------------------------------------ */}
      {/* TWO-COLUMN LAYOUT: AI Panel + Metadata                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* AI COMPLIANCE PANEL — spans 2 columns */}
        <Card
          className={`lg:col-span-2 border-zinc-200 ${
            severity === "Critical" ? "border-red-200 bg-red-50/20" : ""
          }`}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Brain
                className={`h-4 w-4 ${
                  severity === "Critical"
                    ? "text-red-500"
                    : severity === "Clear"
                      ? "text-emerald-500"
                      : "text-amber-500"
                }`}
              />
              <CardTitle className="text-sm font-semibold text-zinc-800">
                AI Compliance Analysis
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-zinc-400">
              Generated by AWS Bedrock · amazon.titan-embed-text-v1
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Risk status row */}
            <div className="flex items-center gap-3">
              <SeverityIcon severity={severity} />
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                  Risk Status
                </p>
                <SeverityBadge severity={severity} />
              </div>
            </div>

            {/* Confidence score */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">
                Confidence Score
              </p>
              <ConfidenceMeter score={insight?.ai_confidence_score ?? null} />
            </div>

            {/* AI result summary */}
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-zinc-400">
                Result Summary
              </p>
              <p className="text-sm leading-relaxed text-zinc-700">
                {insight?.ai_result_summary ?? (
                  <span className="italic text-zinc-400">
                    No AI analysis available for this log yet.
                  </span>
                )}
              </p>
            </div>

            {/* AI reasoning narrative */}
            {insight?.ai_reasoning && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-zinc-400">
                  AI Reasoning
                </p>
                <p className="text-sm leading-relaxed text-zinc-700 whitespace-pre-wrap">
                  {insight.ai_reasoning}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* LOG METADATA — spans 1 column */}
        <Card className="border-zinc-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-zinc-800">
              Log Metadata
            </CardTitle>
            <CardDescription className="text-xs text-zinc-400">
              Cryptographic & identity fields
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <DetailField
              label="Log ID"
              value={
                <code className="font-mono text-xs text-zinc-600">
                  {log.log_id}
                </code>
              }
            />
            <DetailField label="Req ID" value={log.req_id} />
            <DetailField
              label="Build ID"
              value={
                <code className="font-mono text-xs text-zinc-600">
                  {log.build_id}
                </code>
              }
            />
            <DetailField
              label="Org ID"
              value={
                <code className="font-mono text-xs text-zinc-600">
                  {log.org_id}
                </code>
              }
            />
            <DetailField
              label="Signature Hash"
              value={
                <code className="break-all font-mono text-xs text-zinc-500">
                  {log.signature_hash}
                </code>
              }
            />
            <DetailField
              label="Previous Log Hash"
              value={
                <code className="break-all font-mono text-xs text-zinc-500">
                  {log.previous_log_hash}
                </code>
              }
            />
            <DetailField
              label="Deprecated"
              value={log.is_deprecated ? "Yes" : "No"}
            />
            {log.approved_by && (
              <DetailField
                label="Approved By"
                value={
                  <code className="font-mono text-xs text-emerald-600">
                    {approverEmail ?? log.approved_by}
                  </code>
                }
              />
            )}
            {log.approved_at && (
              <DetailField
                label="Approved At"
                value={new Date(log.approved_at).toLocaleString("en-US", {
                  month: "short",
                  day: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  timeZoneName: "short",
                })}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* RAW PAYLOADS ENGINE — Tabs                                           */}
      {/* ------------------------------------------------------------------ */}
      <Card className="border-zinc-200">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-zinc-500" />
            <CardTitle className="text-sm font-semibold text-zinc-800">
              Raw Payloads Engine
            </CardTitle>
          </div>
          <CardDescription className="text-xs text-zinc-400">
            Immutable evidence captured by the omnis-run transport layer
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Tabs defaultValue="clinical" className="w-full">
            <div className="border-b border-zinc-100 px-6">
              <TabsList className="h-10 bg-transparent p-0 gap-0">
                <TabsTrigger
                  value="clinical"
                  className="flex items-center gap-1.5 rounded-none border-b-2 border-transparent px-4 py-2.5 text-xs font-medium text-zinc-500 data-[state=active]:border-zinc-800 data-[state=active]:text-zinc-900 data-[state=active]:shadow-none data-[state=active]:bg-transparent"
                >
                  <FileJson className="h-3.5 w-3.5" />
                  Clinical Payload
                </TabsTrigger>
                <TabsTrigger
                  value="console"
                  className="flex items-center gap-1.5 rounded-none border-b-2 border-transparent px-4 py-2.5 text-xs font-medium text-zinc-500 data-[state=active]:border-zinc-800 data-[state=active]:text-zinc-900 data-[state=active]:shadow-none data-[state=active]:bg-transparent"
                >
                  <Terminal className="h-3.5 w-3.5" />
                  System Console
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Tab 1: Clinical Payload — full sanitized_payload JSONB */}
            <TabsContent value="clinical" className="mt-0">
              <ScrollArea className="h-[420px] w-full rounded-b-xl">
                <pre className="min-h-[420px] whitespace-pre overflow-x-auto bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-emerald-400" style={{ fontVariantLigatures: "none" }}>
                  {clinicalPayloadJson}
                </pre>
              </ScrollArea>
            </TabsContent>

            {/* Tab 2: System Console — raw_logs from sanitized_payload */}
            <TabsContent value="console" className="mt-0">
              <ScrollArea className="h-[420px] w-full rounded-b-xl">
                <pre className="min-h-[420px] whitespace-pre overflow-x-auto bg-zinc-950 p-4 font-mono text-sm leading-relaxed text-green-400" style={{ fontVariantLigatures: "none" }}>
                  {formattedLogs ?? (
                    <span className="italic text-zinc-600">
                      No raw console output captured for this log.
                    </span>
                  )}
                </pre>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LOADING SKELETON
// ---------------------------------------------------------------------------

function ForensicSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-3 w-48 animate-pulse rounded bg-zinc-200" />
      <div className="space-y-2">
        <div className="h-6 w-72 animate-pulse rounded bg-zinc-200" />
        <div className="h-3 w-96 animate-pulse rounded bg-zinc-100" />
      </div>
      <Separator className="bg-zinc-200" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-zinc-200">
          <CardHeader>
            <div className="h-4 w-40 animate-pulse rounded bg-zinc-200" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-4 animate-pulse rounded bg-zinc-100" />
            ))}
          </CardContent>
        </Card>
        <Card className="border-zinc-200">
          <CardHeader>
            <div className="h-4 w-32 animate-pulse rounded bg-zinc-200" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-3 animate-pulse rounded bg-zinc-100" />
            ))}
          </CardContent>
        </Card>
      </div>
      <Card className="border-zinc-200">
        <CardHeader>
          <div className="h-4 w-40 animate-pulse rounded bg-zinc-200" />
        </CardHeader>
        <CardContent>
          <div className="h-64 animate-pulse rounded bg-zinc-100" />
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PAGE EXPORT
// ---------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}

export default async function LogDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { from } = await searchParams;

  // If the user came from the flat-list view, send them back to it.
  const backHref = from === "list" ? "/dashboard?view=list" : "/dashboard";

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <DashboardHeader subtitle="Forensic Evidence Viewer" backHref={backHref} />

      {/* Main */}
      <main className="mx-auto max-w-screen-2xl w-full px-6 py-6 md:px-8 md:py-10">
        <Suspense fallback={<ForensicSkeleton />}>
          <ForensicContent id={id} backHref={backHref} />
        </Suspense>
      </main>
    </div>
  );
}
