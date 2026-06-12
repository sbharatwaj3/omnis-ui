"use client";
// omnis-ui/components/generate-report-button.tsx
// Smart report generation button for the /readiness Traceability Matrix.
//
// Renders a split button:
//   - Dropdown trigger opens a menu with "Export as PDF" and "Export as LaTeX Source (.tex)"
//   - If completion is 100% → immediately triggers download for the selected format
//   - If completion is < 100% → opens the draft-warning AlertDialog first
//
// PDF path: opens the ExportProgressModal which IMMEDIATELY fires the real API
// call to /api/generate-report?format=pdf in the background while the progress
// animation plays. When both the animation and the compile are done, the modal
// surfaces the Download PDF button which triggers a blob download directly from
// the already-fetched data — no second round-trip.
//
// LaTeX path hits /api/generate-report?format=tex directly (fully functional).

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ExportProgressModal } from "@/components/export-progress-modal";
import {
  FileText,
  FileCode2,
  ChevronDown,
  AlertTriangle,
  Loader2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ExportFormat = "tex" | "pdf";

interface GenerateReportButtonProps {
  completionPercent: number;
}

// ---------------------------------------------------------------------------
// Download helper — hits /api/generate-report for the given format.
// Used only for the LaTeX (.tex) path. The PDF path uses the blob returned
// directly by ExportProgressModal via its onDownload callback.
// ---------------------------------------------------------------------------

async function downloadTexReport(setLoading: (v: boolean) => void) {
  setLoading(true);
  try {
    const res = await fetch("/api/generate-report?format=tex");

    if (!res.ok) {
      const contentType = res.headers.get("Content-Type") ?? "";
      let message: unknown;
      if (contentType.includes("application/json")) {
        message = await res.json().catch(() => ({}));
      } else {
        message = await res.text().catch(() => `HTTP ${res.status}`);
      }

      console.error("[generate-report] API error:", res.status, message);
      const errMsg =
        typeof message === "object" && message !== null
          ? (message as { error?: string }).error ?? JSON.stringify(message)
          : String(message);
      alert(`Failed to generate LaTeX source (HTTP ${res.status}).\n\n${errMsg}`);
      return;
    }

    const disposition = res.headers.get("Content-Disposition") ?? "";
    const filenameMatch = disposition.match(/filename="?([^";\n]+)"?/);
    const filename = filenameMatch?.[1] ?? "fda_submission_draft.tex";

    const blob = await res.blob();
    triggerBlobDownload(blob, filename);
  } catch (err) {
    console.error("[generate-report] Network error:", err);
    alert("Network error while generating LaTeX source. Check the console.");
  } finally {
    setLoading(false);
  }
}

// ---------------------------------------------------------------------------
// triggerBlobDownload — creates a temporary anchor, clicks it, cleans up.
// Works for any Blob regardless of MIME type.
// ---------------------------------------------------------------------------

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GenerateReportButton({
  completionPercent,
}: GenerateReportButtonProps) {
  const [loading, setLoading] = useState(false);

  // Draft-warning dialog (shown when completionPercent < 100)
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingFormat, setPendingFormat] = useState<ExportFormat>("tex");

  // Batch Export Progress Center modal (PDF path only)
  const [progressModalOpen, setProgressModalOpen] = useState(false);

  const isComplete = completionPercent === 100;

  // ── Format selection entry point ─────────────────────────────────────────

  function handleFormatSelect(format: ExportFormat) {
    if (isComplete) {
      initiateExport(format);
    } else {
      setPendingFormat(format);
      setDialogOpen(true);
    }
  }

  // Called after the user confirms the draft warning dialog
  function handleGenerateDraft() {
    setDialogOpen(false);
    initiateExport(pendingFormat);
  }

  // ── Export routing ───────────────────────────────────────────────────────
  // PDF → open the progress modal, which fires the API call immediately.
  // TeX → hit the API directly.

  function initiateExport(format: ExportFormat) {
    if (format === "pdf") {
      setProgressModalOpen(true);
    } else {
      void downloadTexReport(setLoading);
    }
  }

  // Called by the progress modal when the compile succeeded and the user
  // clicks "Download PDF". The blob was already fetched inside the modal —
  // we just trigger the browser save-as dialog here.
  function handleProgressModalDownload(blob: Blob) {
    setProgressModalOpen(false);
    triggerBlobDownload(blob, "fda_submission.pdf");
  }

  function handleProgressModalClose() {
    setProgressModalOpen(false);
  }

  return (
    <>
      {/* ── Split button: label + chevron trigger ── */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            disabled={loading}
            size="sm"
            className="flex items-center gap-2 bg-zinc-900 text-zinc-50 hover:bg-zinc-700 disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            {loading ? "Generating…" : "Generate Regulatory Report"}
            <ChevronDown className="ml-0.5 h-3.5 w-3.5 opacity-70" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          {/* PDF export — opens Batch Export Progress Center */}
          <DropdownMenuItem
            className="flex cursor-pointer items-center gap-2 text-sm"
            onClick={() => handleFormatSelect("pdf")}
          >
            <FileText className="h-4 w-4 text-zinc-500" />
            <div>
              <p className="font-medium">Export as PDF</p>
              <p className="text-[11px] text-zinc-400">
                Compiled eSTAR report · pdflatex
              </p>
            </div>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* LaTeX export — fully functional */}
          <DropdownMenuItem
            className="flex cursor-pointer items-center gap-2 text-sm"
            onClick={() => handleFormatSelect("tex")}
          >
            <FileCode2 className="h-4 w-4 text-zinc-500" />
            <div>
              <p className="font-medium">Export as LaTeX Source</p>
              <p className="text-[11px] text-zinc-400">.tex · ready to compile</p>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* ── Draft warning modal ── */}
      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent className="border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <AlertDialogHeader>
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <AlertDialogTitle className="text-zinc-900 dark:text-zinc-100">
                Incomplete Compliance Matrix
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              Your compliance matrix is{" "}
              <span className="font-semibold text-amber-600">
                {completionPercent.toFixed(1)}% ready
              </span>
              . Generating a{" "}
              <span className="font-mono text-xs font-semibold">
                {pendingFormat === "pdf" ? "PDF" : ".tex"}
              </span>{" "}
              report now will produce an incomplete draft suitable for internal
              status updates, but it{" "}
              <span className="font-semibold text-red-600">
                will be rejected by the FDA
              </span>{" "}
              for formal submission. All requirements must have at least one
              digitally approved evidence log before a compliant report can be
              generated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleGenerateDraft}
              className="bg-amber-500 text-white hover:bg-amber-600"
            >
              Generate Draft{" "}
              {pendingFormat === "pdf" ? "PDF" : "LaTeX"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Batch Export Progress Center ── */}
      <ExportProgressModal
        open={progressModalOpen}
        onClose={handleProgressModalClose}
        onDownload={handleProgressModalDownload}
      />
    </>
  );
}
