"use client";
// omnis-ui/components/export-progress-modal.tsx
// Batch Export Progress Center — eSTAR Documentation Generation
//
// Renders a centered modal dialog with a blurred backdrop that runs a
// simulated 5-step state machine representing the PDF export pipeline.
// Opens when triggered and auto-advances through each step on a timer.
// Once all steps complete it surfaces a Download PDF + Close action pair.
//
// The "Download PDF" button triggers client-side generation via
// utils/generate-pdf.ts (html2canvas + jsPDF) — no server round-trip needed.

import { useEffect, useState, useCallback } from "react";
import { CheckCircle2, Circle, Loader2, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateCompliancePdf } from "@/utils/generate-pdf";

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
    completesAt: 12_000, // completes immediately when it becomes active
  },
];

const TOTAL_DURATION_MS = 12_000;

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

type StepStatus = "pending" | "active" | "completed";

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
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExportProgressModal({
  open,
  onClose,
}: ExportProgressModalProps) {
  const [stepStates, setStepStates] = useState<StepState[]>(buildInitialStepStates);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Reset state every time the modal opens
  useEffect(() => {
    if (!open) return;

    setStepStates(buildInitialStepStates());
    setElapsedMs(0);
    setIsComplete(false);

    const startTime = Date.now();

    const tick = setInterval(() => {
      const now = Date.now() - startTime;
      setElapsedMs(now);

      setStepStates(
        EXPORT_STEPS.map((step) => {
          if (now >= step.completesAt && step.id === EXPORT_STEPS[EXPORT_STEPS.length - 1].id) {
            // Last step — mark complete only if we've actually reached it
            return { status: now >= step.startsAt ? "completed" : "pending" };
          }
          if (now >= step.completesAt) return { status: "completed" };
          if (now >= step.startsAt) return { status: "active" };
          return { status: "pending" };
        })
      );

      if (now >= TOTAL_DURATION_MS) {
        clearInterval(tick);
        setIsComplete(true);
      }
    }, 80); // ~12 fps tick — smooth enough, lightweight

    return () => clearInterval(tick);
  }, [open]);

  // Progress bar percentage (0–100), capped at 100
  const progressPercent = Math.min(100, (elapsedMs / TOTAL_DURATION_MS) * 100);

  // Trap keyboard: close on Escape
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape" && isComplete) onClose();
    },
    [isComplete, onClose]
  );

  // Handles the Download PDF button — runs client-side generation
  async function handleDownload() {
    setIsGenerating(true);
    try {
      await generateCompliancePdf("compliance-report-content");
    } catch (err) {
      console.error("[export-progress-modal] PDF generation failed:", err);
      alert("PDF generation failed. Please check the browser console for details.");
    } finally {
      setIsGenerating(false);
    }
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
      <div className="relative w-full max-w-md mx-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-6 flex flex-col gap-5">

        {/* Close button — only enabled once complete */}
        {isComplete && (
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="absolute top-4 right-4 rounded-md p-1 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* Header */}
        <div>
          <h2
            id="export-modal-title"
            className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100"
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
            <span className="tabular-nums font-medium text-zinc-600 dark:text-zinc-300">
              {Math.round(progressPercent)}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-150 ease-linear"
              style={{ width: `${progressPercent}%` }}
              role="progressbar"
              aria-valuenow={Math.round(progressPercent)}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>

        {/* Vertical timeline */}
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
                          : "bg-zinc-200 dark:bg-zinc-700",
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
                        ? "font-semibold text-emerald-600 dark:text-emerald-400"
                        : status === "active"
                          ? "font-semibold text-blue-600 dark:text-blue-400"
                          : "font-normal text-zinc-400 dark:text-zinc-500",
                    ].join(" ")}
                  >
                    {step.label}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>

        {/* Completion actions */}
        {isComplete && (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end border-t border-zinc-100 dark:border-zinc-800 pt-4 mt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isGenerating}
              className="order-2 sm:order-1 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
            >
              Close
            </Button>
            <Button
              size="sm"
              onClick={() => void handleDownload()}
              disabled={isGenerating}
              className="order-1 sm:order-2 flex items-center gap-2 bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 disabled:opacity-60"
            >
              {isGenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {isGenerating ? "Generating PDF…" : "Download PDF"}
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
    <Circle className="h-5 w-5 shrink-0 text-zinc-300 dark:text-zinc-600" aria-label="Pending" />
  );
}
