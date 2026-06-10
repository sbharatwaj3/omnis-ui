"use client";
// omnis-ui/components/generate-report-button.tsx
// Smart report generation button for the /readiness Traceability Matrix.
//
// Renders a split button:
//   - Dropdown trigger opens a menu with "Export as PDF" and "Export as LaTeX Source (.tex)"
//   - If completion is 100% → immediately triggers download for the selected format
//   - If completion is < 100% → opens the draft-warning AlertDialog first
//
// The download hits /api/generate-report?format=tex|pdf.
// The PDF path currently returns 501 from the API (engine not yet wired).

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
// Download helper
// ---------------------------------------------------------------------------

async function downloadReport(
  format: ExportFormat,
  setLoading: (v: boolean) => void
) {
  setLoading(true);
  try {
    const res = await fetch(`/api/generate-report?format=${format}`);

    if (!res.ok) {
      // Try to parse a JSON error body first, fall back to status text
      const contentType = res.headers.get("Content-Type") ?? "";
      let message: unknown;
      if (contentType.includes("application/json")) {
        message = await res.json().catch(() => ({}));
      } else {
        message = await res.text().catch(() => `HTTP ${res.status}`);
      }

      console.error("[generate-report] API error:", res.status, message);

      if (res.status === 501) {
        const msg = typeof message === "object" ? JSON.stringify(message) : String(message);
        alert(`PDF export is not yet available.\n\n${msg}`);
      } else if (res.status === 500 && typeof message === "object" && message !== null) {
        const errObj = message as { error?: string; detail?: string };
        const detail = errObj.detail ? `\n\nCompiler log excerpt:\n${errObj.detail}` : "";
        alert(`Failed to generate report (HTTP 500).\n\n${errObj.error ?? "Unknown error"}${detail}`);
      } else {
        alert(`Failed to generate report (HTTP ${res.status}).\n\n${String(message)}`);
      }
      return;
    }

    // Derive filename from Content-Disposition or fall back to format default
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const filenameMatch = disposition.match(/filename="?([^";\n]+)"?/);
    const filename =
      filenameMatch?.[1] ??
      (format === "pdf" ? "fda_submission_draft.pdf" : "fda_submission_draft.tex");

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setTimeout(() => URL.revokeObjectURL(url), 5_000);
  } catch (err) {
    console.error("[generate-report] Network error:", err);
    alert("Network error while generating report. Check the console.");
  } finally {
    setLoading(false);
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GenerateReportButton({
  completionPercent,
}: GenerateReportButtonProps) {
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingFormat, setPendingFormat] = useState<ExportFormat>("tex");

  const isComplete = completionPercent === 100;

  function handleFormatSelect(format: ExportFormat) {
    if (isComplete) {
      void downloadReport(format, setLoading);
    } else {
      setPendingFormat(format);
      setDialogOpen(true);
    }
  }

  function handleGenerateDraft() {
    setDialogOpen(false);
    void downloadReport(pendingFormat, setLoading);
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
          {/* PDF export — API returns 501 until engine is wired */}
          <DropdownMenuItem
            className="flex cursor-pointer items-center gap-2 text-sm"
            onClick={() => handleFormatSelect("pdf")}
          >
            <FileText className="h-4 w-4 text-zinc-500" />
            <div>
              <p className="font-medium">Export as PDF</p>
              <p className="text-[11px] text-zinc-400">
                Compiled report · coming soon
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
        <AlertDialogContent className="border-zinc-200 bg-white">
          <AlertDialogHeader>
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <AlertDialogTitle className="text-zinc-900">
                Incomplete Compliance Matrix
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-sm leading-relaxed text-zinc-600">
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
            <AlertDialogCancel className="border-zinc-200 text-zinc-700 hover:bg-zinc-50">
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
    </>
  );
}
