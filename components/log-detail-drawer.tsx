"use client";
// omnis-ui/components/log-detail-drawer.tsx
// Quick-View Modal for the FDA Assurance Dashboard.
//
// Architecture: Two-step "Quick View vs. Deep Dive"
//   Step A — This centered modal shows the immediate high-level metadata:
//             Execution Time, Event Source, Signature Hash, AI Analysis Summary.
//   Step B — "View Full Evidence Log" button routes to /logs/[id] for the
//             full forensic page with raw JSON, stack traces, and Part 11 actions.
//
// Data is fetched client-side via the Supabase browser client so the modal
// works inside a "use client" tree without navigating away — preserving the
// user's active filter/pagination state in the parent.

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Badge } from "@/components/ui/badge";
import {
  X,
  ExternalLink,
  Brain,
  ShieldCheck,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Clock,
  Radio,
  KeyRound,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuickViewLog {
  log_id: string;
  execution_status: string;
  execution_timestamp: string;
  event_source: string;
  signature_hash: string;
}

interface QuickViewInsight {
  ai_result_summary: string | null;
  ai_confidence_score: number | null;
}

type Severity = "Critical" | "Clear" | "Pending";

function mapSeverity(summary: string | null | undefined): Severity {
  if (!summary) return "Pending";
  if (/critical|failure|anomaly/i.test(summary)) return "Critical";
  return "Clear";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SeverityBadge({ severity }: { severity: Severity }) {
  if (severity === "Critical")
    return (
      <Badge className="border border-red-200 bg-red-100 text-red-700 hover:bg-red-100 font-semibold">
        ● Critical
      </Badge>
    );
  if (severity === "Clear")
    return (
      <Badge className="border border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-100 font-medium">
        ● Clear
      </Badge>
    );
  return (
    <Badge className="border border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100 font-medium">
      ● Pending
    </Badge>
  );
}

function SeverityIcon({ severity }: { severity: Severity }) {
  if (severity === "Critical")
    return <AlertTriangle className="h-4 w-4 text-red-500" />;
  if (severity === "Clear")
    return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  return <HelpCircle className="h-4 w-4 text-amber-500" />;
}

function ConfidenceMeter({ score }: { score: number | null }) {
  if (score === null) return <span className="text-zinc-400 text-xs">—</span>;
  const color =
    score >= 80 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-zinc-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-semibold tabular-nums text-zinc-700">{score}%</span>
    </div>
  );
}

/** A labelled metadata row with icon, label, and value. */
function MetaField({
  icon,
  label,
  value,
  fixedHeight = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  fixedHeight?: boolean;
}) {
  return (
    <div
      className={[
        "flex flex-col gap-1 rounded-lg border border-zinc-100 bg-zinc-50 p-4",
        fixedHeight ? "h-[108px] overflow-hidden" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-zinc-400">{icon}</span>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
          {label}
        </span>
      </div>
      <div className="flex-1 overflow-hidden text-sm text-zinc-700 break-all">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main modal component
// The component is exported under the same name so no import changes are
// needed in dashboard-client.tsx — the API (logId + onClose) is identical.
// ---------------------------------------------------------------------------

interface LogDetailDrawerProps {
  logId: string | null;
  onClose: () => void;
}

export function LogDetailDrawer({ logId, onClose }: LogDetailDrawerProps) {
  const router = useRouter();
  const [log, setLog] = useState<QuickViewLog | null>(null);
  const [insight, setInsight] = useState<QuickViewInsight | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchDetails = useCallback(async (id: string) => {
    setLoading(true);
    setLog(null);
    setInsight(null);

    const supabase = createClient();

    const { data: logData } = await supabase
      .from("evidence_logs")
      .select(
        "log_id, execution_status, execution_timestamp, event_source, signature_hash"
      )
      .eq("log_id", id)
      .single();

    if (logData) setLog(logData as QuickViewLog);

    const { data: insightData } = await supabase
      .from("ai_compliance_insights")
      .select("ai_result_summary, ai_confidence_score")
      .eq("log_id", id)
      .maybeSingle();

    if (insightData) setInsight(insightData as QuickViewInsight);

    setLoading(false);
  }, []);

  useEffect(() => {
    if (logId) fetchDetails(logId);
  }, [logId, fetchDetails]);

  // Close on Escape key
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const isOpen = !!logId;
  const severity = mapSeverity(insight?.ai_result_summary);

  const formattedTime = log
    ? new Date(log.execution_timestamp).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
      })
    : null;

  function handleFullView() {
    if (logId) {
      onClose();
      router.push(`/logs/${logId}`);
    }
  }

  return (
    <>
      {/* Backdrop — click to close */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={[
          "fixed inset-0 z-40 bg-zinc-900/40 backdrop-blur-[2px] transition-opacity duration-200",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        ].join(" ")}
      />

      {/* Centered modal — outer wrapper stops backdrop click from bubbling through */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Evidence log quick view"
        className={[
          "fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-200",
          isOpen ? "pointer-events-auto" : "pointer-events-none",
        ].join(" ")}
        onClick={onClose}
      >
        {/* Stop clicks inside the panel from reaching the backdrop handler */}
        <div
          onClick={(e) => e.stopPropagation()}
          className={[
            "relative w-full max-w-lg rounded-2xl border border-zinc-200 bg-white shadow-2xl mx-2",
            "",
            "transition-all duration-200",
            isOpen ? "opacity-100 scale-100" : "opacity-0 scale-95",
          ].join(" ")}
        >
          {/* ── Modal header ─────────────────────────────────────────────── */}
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 sm:px-8 sm:py-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-zinc-500" strokeWidth={1.75} />
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                Evidence Log · Quick View
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close quick view"
              className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* ── Modal body ───────────────────────────────────────────────── */}
          <div className="px-5 py-5 sm:px-8 sm:py-6">
            {/* Loading state */}
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
              </div>
            )}

            {/* Not found state */}
            {!loading && !log && isOpen && (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                <ShieldCheck className="h-8 w-8 text-zinc-300" />
                <p className="text-sm font-medium text-zinc-500">Log not found</p>
                <p className="text-xs text-zinc-400">
                  This log may have been deprecated or removed.
                </p>
              </div>
            )}

            {/* Content */}
            {!loading && log && (
              <div className="space-y-5">
                {/* Log ID + severity status strip */}
                <div className="flex items-center justify-between">
                  <code className="font-mono text-xs text-zinc-400">
                    {log.log_id.slice(0, 8)}…{log.log_id.slice(-4)}
                  </code>
                  <div className="flex items-center gap-2">
                    <SeverityIcon severity={severity} />
                    <SeverityBadge severity={severity} />
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                        log.execution_status?.toUpperCase() === "SUCCESS"
                          ? "bg-zinc-100 text-zinc-600"
                          : "bg-orange-50 text-orange-700"
                      }`}
                    >
                      {log.execution_status ?? "—"}
                    </span>
                  </div>
                </div>

                {/* Four high-level metadata fields — fixed heights for grid consistency */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <MetaField
                    fixedHeight
                    icon={<Clock className="h-3.5 w-3.5" />}
                    label="Execution Time"
                    value={
                      <span className="text-xs leading-relaxed">{formattedTime}</span>
                    }
                  />
                  <MetaField
                    fixedHeight
                    icon={<Radio className="h-3.5 w-3.5" />}
                    label="Event Source"
                    value={<span className="text-sm">{log.event_source}</span>}
                  />
                  <MetaField
                    fixedHeight
                    icon={<KeyRound className="h-3.5 w-3.5" />}
                    label="Signature Hash"
                    value={
                      <code className="break-all font-mono text-[10px] text-zinc-500">
                        {log.signature_hash}
                      </code>
                    }
                  />
                  <MetaField
                    icon={<Brain className="h-3.5 w-3.5" />}
                    label="AI Analysis Summary"
                    value={
                      insight?.ai_result_summary ? (
                        <span className="line-clamp-3 text-xs leading-relaxed">
                          {insight.ai_result_summary}
                        </span>
                      ) : (
                        <span className="text-xs italic text-zinc-400">
                          No analysis yet
                        </span>
                      )
                    }
                  />
                </div>

                {/* AI confidence — only shown when available */}
                {insight?.ai_confidence_score !== null &&
                  insight?.ai_confidence_score !== undefined && (
                  <div className="flex items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 shrink-0">
                      AI Confidence
                    </span>
                    <ConfidenceMeter score={insight.ai_confidence_score} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Modal footer ─────────────────────────────────────────────── */}
          {!loading && log && (
            <div className="flex items-center justify-between border-t border-zinc-100 px-5 py-4 sm:px-8 sm:py-5">
              <button
                onClick={onClose}
                className="text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-600"
              >
                Close
              </button>
              <button
                onClick={handleFullView}
                className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-700"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View Full Evidence Log
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
