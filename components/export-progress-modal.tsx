"use client";
// omnis-ui/components/export-progress-modal.tsx
// Batch Export Progress Center — eSTAR Documentation Generation
//
// Renders a centered modal dialog that runs the REAL PDF compile pipeline
// while showing animated progress steps to the user.
//
// KEY DESIGN:
//   The API fetch starts the moment the modal opens (not after the animation).
//   The progress animation runs in parallel as a UX affordance; on completion
//   (or on API resolution, whichever is later) the Download button appears.
//   If the API errors, the modal surfaces the error in-place with a Retry option.

import { useEffect, useState, useCallback, useRef } from "react";
import { CheckCircle2, Circle, Loader2, Download, X, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Step definitions — label + timing (cumulative ms from modal open)
// ---------------------------------------------------------------------------

interface ExportStep {
  id: number;
  label: string;
  /** Wall-clock ms from modal-open at which this step becomes "active" */
  startsAt: number;
  /** Wall-clock ms from modal-open at which this step becomes "completed" */
  completesAt: number;
}

const EXPORT_STEPS: ExportStep[] = [
  {
    id: 1,
    label: "Initializing export engine...",
    startsAt: 0,
    completesAt: 2_000,
  },
  {
    id: 2,
    label: "Compiling evidence logs and matrices...",
    startsAt: 2_000,
    completesAt: 5_000,
  },
  {
    id: 3,
    label: "Generating AI traceability insights...",
    startsAt: 5_000,
    completesAt: 9_000,
  },
  {
    id: 4,
    label: "Cryptographically signing records...",
    startsAt: 9_000,
    completesAt: 12_000,
  },
  {
    id: 5,
    label: "Ready for Download.",
    startsAt: 12_000,
    completesAt: 12_000,
  },
];

const ANIMATION_DURATION_MS = 12_000;

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

type StepStatus = "pending" | "active" | "completed";
type ApiState = "pending" | "success" | "error";

interface StepState {
  status: StepStatus;
}

function buildInitialStepStates(): StepState[] {
  return EXPORT_STEPS.map((s) => ({
    status: s.startsAt === 0 ? "active" : "pending",
  }));
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ExportProgressModalProps {
  /** Controls whether the modal is visible */
  open: boolean;
  /** Called when user clicks the Close button */
  onClose: () => void;
  /**
   * Called when user clicks "Download PDF" after a successful compile.
   * Receives the compiled PDF Blob so the caller can trigger the browser
   * file download directly from the already-fetched data.
   */
  onDownload: (blob: Blob) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExportProgressModal({
  open,
  onClose,
  onDownload,
}: ExportProgressModalProps) {
  const [stepStates, setStepStates] = useState<StepState[]>(buildInitialStepStates);
  const [elapsedMs, setElapsedMs] = useState(0);
  // animationDone: the 12-second UX animation has finished
  const [animationDone, setAnimationDone] = useState(false);
  // apiState: tracks the actual fetch to /api/generate-report?format=pdf
  const [apiState, setApiState] = useState<ApiState>("pending");
  const [apiError, setApiError] = useState<string | null>(null);
  // pdfBlob: holds the compiled PDF in memory once ready
  const pdfBlobRef = useRef<Blob | null>(null);
  // retryCount: incremented each time the user clicks Retry, re-triggering the fetch
  const [retryCount, setRetryCount] = useState(0);

  // Both the animation AND the API call must finish before "Download" appears.
  const isComplete = animationDone && apiState === "success";

  // ── API fetch ─────────────────────────────────────────────────────────────
  // Runs immediately when the modal opens (or when the user retries).
  // Independent of the animation timer.
  useEffect(() => {
    if (!open) return;

    setApiState("pending");
    setApiError(null);
    pdfBlobRef.current = null;

    let cancelled = false;

    async function fetchPdf() {
      try {
        const res = await fetch("/api/generate-report?format=pdf");

        if (cancelled) return;

        if (!res.ok) {
          const contentType = res.headers.get("Content-Type") ?? "";
          let detail = `HTTP ${res.status}`;
          if (contentType.includes("application/json")) {
            // The API returns { error: string, detail: { error, log_tail, job_id } }
            // We extract the inner log_tail for the most useful debug info.
            const body = await res.json().catch(() => ({})) as {
              error?: string;
              detail?: { error?: string; log_tail?: string; job_id?: string } | string;
            };
            const outerError = body.error ?? `HTTP ${res.status}`;
            const inner = body.detail;
            if (inner && typeof inner === "object") {
              detail = inner.error ?? outerError;
              if (inner.log_tail) detail += `\n\n── pdflatex log ──\n${inner.log_tail}`;
            } else if (typeof inner === "string") {
              detail = outerError + (inner ? `\n\n${inner}` : "");
            } else {
              detail = outerError;
            }
          } else {
            const text = await res.text().catch(() => "");
            if (text) detail += `: ${text}`;
          }
          setApiError(detail);
          setApiState("error");
          return;
        }

        const blob = await res.blob();
        if (cancelled) return;

        pdfBlobRef.current = blob;
        setApiState("success");
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Network error";
        setApiError(msg);
        setApiState("error");
      }
    }

    void fetchPdf();

    return () => {
      cancelled = true;
    };
    // retryCount in deps so a Retry click re-runs this effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, retryCount]);

  // ── Organic jitter progress state ────────────────────────────────────────
  // Separate from elapsedMs — this is the value shown in the progress bar.
  // It never exceeds 95 while the API is still pending; the final jump to
  // 100 only happens when apiState resolves to success or error.
  const [jitterProgress, setJitterProgress] = useState(0);

  // ── Animation timer ───────────────────────────────────────────────────────
  // Drives two things in parallel:
  //   1. elapsedMs → step label transitions (unchanged, time-based)
  //   2. jitterProgress → the progress bar fill (randomised jitter loop)
  // Fully independent of the API call.
  useEffect(() => {
    if (!open) return;

    setStepStates(buildInitialStepStates());
    setElapsedMs(0);
    setAnimationDone(false);
    setJitterProgress(0);

    const startTime = Date.now();

    // ── Step label ticker (fixed 80 ms, same as before) ──────────────────
    const stepTick = setInterval(() => {
      const now = Date.now() - startTime;
      setElapsedMs(now);

      setStepStates(
        EXPORT_STEPS.map((step) => {
          if (now >= step.completesAt && step.id === EXPORT_STEPS[EXPORT_STEPS.length - 1].id) {
            return { status: now >= step.startsAt ? "completed" : "pending" };
          }
          if (now >= step.completesAt) return { status: "completed" };
          if (now >= step.startsAt) return { status: "active" };
          return { status: "pending" };
        })
      );

      if (now >= ANIMATION_DURATION_MS) {
        clearInterval(stepTick);
        setAnimationDone(true);
      }
    }, 80);

    // ── Organic jitter loop (randomised setTimeout chain) ─────────────────
    // Each tick adds a random Δ that shrinks as we approach the 95% ceiling,
    // then waits a random interval before the next tick — giving a natural
    // "stall and sprint" feel instead of a mechanical linear march.
    const CEILING = 95;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    function scheduleNextTick(current: number) {
      if (stopped) return;

      // How much headroom is left before the ceiling?
      const headroom = CEILING - current;
      if (headroom <= 0) return; // parked at ceiling — wait for API

      // Jump size: full range (1–7) when far away, shrinks to (0.2–1.5) in
      // the last 10 points so the bar visibly labours near the end.
      const nearingEnd = headroom < 10;
      const minJump = nearingEnd ? 0.2 : 1;
      const maxJump = nearingEnd ? 1.5 : 7;
      const delta = minJump + Math.random() * (maxJump - minJump);

      const next = Math.min(current + delta, CEILING);

      // Delay: 150–600 ms normally; slow down even more in the last stretch.
      const minDelay = nearingEnd ? 300 : 150;
      const maxDelay = nearingEnd ? 900 : 600;
      const delay = minDelay + Math.random() * (maxDelay - minDelay);

      timeoutId = setTimeout(() => {
        if (stopped) return;
        setJitterProgress(next);
        scheduleNextTick(next);
      }, delay);
    }

    // Kick off with a short initial pause so the bar doesn't jump instantly.
    timeoutId = setTimeout(() => scheduleNextTick(0), 120);

    return () => {
      stopped = true;
      clearInterval(stepTick);
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, [open]);

  // ── Retry handler ─────────────────────────────────────────────────────────
  function handleRetry() {
    setRetryCount((c) => c + 1);
  }

  // Progress bar: driven by the organic jitter state while waiting.
  // Once the API resolves (success or error) we jump straight to 100%,
  // which can never happen before the response is actually received.
  const progressPercent =
    apiState !== "pending"
      ? 100
      : jitterProgress;

  // Trap keyboard: close on Escape (only when complete or errored)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape" && (isComplete || apiState === "error")) onClose();
    },
    [isComplete, apiState, onClose]
  );

  function handleDownloadClick() {
    const blob = pdfBlobRef.current;
    if (blob) onDownload(blob);
  }

  if (!open) return null;

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/40"
      aria-modal="true"
      role="dialog"
      aria-labelledby="export-modal-title"
      onKeyDown={handleKeyDown}
    >
      {/* Modal panel */}
      <div className="relative w-full max-w-md mx-4 rounded-2xl border border-zinc-200 bg-white shadow-2xl p-6 flex flex-col gap-5">

        {/* Close button — only enabled once complete or errored */}
        {(isComplete || apiState === "error") && (
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="absolute top-4 right-4 rounded-md p-1 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* Header */}
        <div>
          <h2
            id="export-modal-title"
            className="text-lg font-bold tracking-tight text-zinc-900"
          >
            Generating eSTAR Documentation
          </h2>
          <p className="mt-1 text-xs text-zinc-400">
            FDA 21 CFR Part 11 · IEC 62304 compliant export
          </p>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Export progress</span>
            <span className="tabular-nums font-medium text-zinc-600">
              {Math.round(progressPercent)}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
            <div
              className={[
                "h-full rounded-full transition-all duration-150 ease-linear",
                apiState === "error"
                  ? "bg-red-500"
                  : isComplete
                    ? "bg-emerald-500"
                    : "bg-blue-500",
              ].join(" ")}
              style={{ width: `${progressPercent}%` }}
              role="progressbar"
              aria-valuenow={Math.round(progressPercent)}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>

        {/* Vertical timeline — hidden if errored, replaced by error panel */}
        {apiState !== "error" && (
          <ol className="flex flex-col gap-0" aria-label="Export steps">
            {EXPORT_STEPS.map((step, idx) => {
              const status = stepStates[idx]?.status ?? "pending";
              const isLast = idx === EXPORT_STEPS.length - 1;

              return (
                <li key={step.id} className="flex items-stretch gap-3">
                  {/* Icon + connector line column */}
                  <div className="flex flex-col items-center">
                    <StepIcon status={status} />
                    {!isLast && (
                      <div
                        className={[
                          "mt-1 w-px flex-1 min-h-[20px] rounded-full transition-colors duration-300",
                          status === "completed"
                            ? "bg-emerald-400"
                            : "bg-zinc-200",
                        ].join(" ")}
                      />
                    )}
                  </div>

                  {/* Label */}
                  <div className={`pb-4 pt-0.5 flex items-start ${isLast ? "pb-0" : ""}`}>
                    <span
                      className={[
                        "text-sm leading-snug transition-colors duration-200",
                        status === "completed"
                          ? "font-semibold text-emerald-600"
                          : status === "active"
                            ? "font-semibold text-blue-600"
                            : "font-normal text-zinc-400",
                      ].join(" ")}
                    >
                      {step.label}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {/* Waiting-on-server indicator (animation done but API still running) */}
        {animationDone && apiState === "pending" && (
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-blue-500" />
            <span>Waiting for LaTeX compiler service…</span>
          </div>
        )}

        {/* Error panel */}
        {apiState === "error" && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-700">
                  Compilation Failed
                </p>
                {apiError && (
                  <p className="mt-1 text-xs text-red-600 whitespace-pre-wrap break-words">
                    {apiError}
                  </p>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRetry}
              className="flex items-center gap-2 border-red-300 text-red-700 hover:bg-red-100"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        )}

        {/* Completion actions */}
        {isComplete && (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end border-t border-zinc-100 pt-4 mt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="order-2 sm:order-1 border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            >
              Close
            </Button>
            <Button
              size="sm"
              onClick={handleDownloadClick}
              className="order-1 sm:order-2 flex items-center gap-2 bg-zinc-900 text-white hover:bg-zinc-700"
            >
              <Download className="h-3.5 w-3.5" />
              Download PDF
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StepIcon — renders the correct Lucide icon for each step state
// ---------------------------------------------------------------------------

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "completed") {
    return (
      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" aria-label="Completed" />
    );
  }
  if (status === "active") {
    return (
      <Loader2
        className="h-5 w-5 shrink-0 animate-spin text-blue-500"
        aria-label="In progress"
      />
    );
  }
  return (
    <Circle className="h-5 w-5 shrink-0 text-zinc-300" aria-label="Pending" />
  );
}
