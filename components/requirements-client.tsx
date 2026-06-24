"use client";
// omnis-ui/components/requirements-client.tsx
// Requirements Management — Interactive client layer.
//
// Responsibilities:
//   1. Data table displaying all company_requirements rows.
//   2. "Add New Requirement" modal with regulatory rule multi-select.
//   3. "Import CSV" modal with native File API parser — no external deps.
//   4. Calls createRequirement / bulkImportRequirements server actions.
//
// CONSTITUTION LAW VII:
//   - RBAC visual enforcement: Add/Import buttons disabled for developer/viewer.
//     Server actions independently re-enforce this gate.
//   - Regulatory mapping now reads from regulatory_rules (req_id, rule_source,
//     description). regulatory_clauses has been dropped per migration 20260624120000.
//   - Light mode only — no dark: variants used anywhere.

import { useState, useTransition, useMemo, useRef, useCallback, useEffect } from "react";
import {
  createRequirement,
  bulkImportRequirements,
  type CompanyRequirement,
  type RegulatoryRule,
  type BulkImportRow,
} from "@/app/dashboard/requirements/actions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus,
  X,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  Upload,
  FileText,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RequirementsClientProps {
  initialRequirements: CompanyRequirement[];
  rules: RegulatoryRule[];
  /** The current user's role — used for RBAC visual enforcement. */
  userRole: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

/** Groups rules by rule_source for a cleaner multi-select UI. */
function groupRulesBySource(
  rules: RegulatoryRule[],
): Map<string, RegulatoryRule[]> {
  const map = new Map<string, RegulatoryRule[]>();
  for (const rule of rules) {
    const bucket = map.get(rule.rule_source);
    if (bucket) bucket.push(rule);
    else map.set(rule.rule_source, [rule]);
  }
  return map;
}

// ---------------------------------------------------------------------------
// MappingBadges — renders compact rule badges for a requirement row
// ---------------------------------------------------------------------------

function MappingBadges({
  ruleIds,
  rules,
}: {
  ruleIds: string[];
  rules: RegulatoryRule[];
}) {
  if (ruleIds.length === 0) {
    return <span className="text-xs text-zinc-400 italic">—</span>;
  }

  const ruleMap = useMemo(() => {
    const m = new Map<string, RegulatoryRule>();
    for (const r of rules) m.set(r.req_id, r);
    return m;
  }, [rules]);

  const MAX_VISIBLE = 2;
  const visible = ruleIds.slice(0, MAX_VISIBLE);
  const overflow = ruleIds.length - MAX_VISIBLE;

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((id) => {
        const r = ruleMap.get(id);
        if (!r) return null;
        return (
          <span
            key={id}
            title={`${r.rule_source} — ${r.description ?? ""}`}
            className="inline-flex items-center rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600"
          >
            {r.req_id}
          </span>
        );
      })}
      {overflow > 0 && (
        <span className="inline-flex items-center rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">
          +{overflow} more
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RuleMultiSelect — grouped checkbox list for regulatory rule selection
// ---------------------------------------------------------------------------

interface RuleMultiSelectProps {
  rules: RegulatoryRule[];
  selected: Set<string>;
  onToggle: (reqId: string) => void;
}

function RuleMultiSelect({ rules, selected, onToggle }: RuleMultiSelectProps) {
  const grouped = useMemo(() => groupRulesBySource(rules), [rules]);

  const [openSources, setOpenSources] = useState<Set<string>>(
    () => new Set(Array.from(grouped.keys())),
  );

  function toggleSource(name: string) {
    setOpenSources((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  if (rules.length === 0) {
    return (
      <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-400">
        No regulatory rules found in the database.
      </p>
    );
  }

  return (
    <div className="max-h-56 overflow-y-auto rounded-lg border border-zinc-200 bg-white">
      {Array.from(grouped.entries()).map(([source, items]) => {
        const isOpen = openSources.has(source);
        const selectedInGroup = items.filter((r) => selected.has(r.req_id)).length;
        return (
          <div key={source} className="border-b border-zinc-100 last:border-b-0">
            <button
              type="button"
              onClick={() => toggleSource(source)}
              className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400"
            >
              <span className="text-xs font-semibold text-zinc-700">{source}</span>
              <div className="flex items-center gap-2">
                {selectedInGroup > 0 && (
                  <span className="rounded-full border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600">
                    {selectedInGroup}
                  </span>
                )}
                {isOpen ? (
                  <ChevronUp className="h-3.5 w-3.5 text-zinc-400" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
                )}
              </div>
            </button>
            {isOpen && (
              <div className="divide-y divide-zinc-50 bg-zinc-50/50">
                {items.map((rule) => {
                  const checked = selected.has(rule.req_id);
                  return (
                    <label
                      key={rule.req_id}
                      className="flex cursor-pointer items-start gap-3 px-4 py-2 hover:bg-zinc-100"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggle(rule.req_id)}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-zinc-900"
                      />
                      <div className="min-w-0">
                        <span className="font-mono text-xs font-semibold text-zinc-800">
                          {rule.req_id}
                        </span>
                        {rule.description && (
                          <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500 line-clamp-2">
                            {rule.description}
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AddRequirementModal — centered modal with form + rule multi-select
// ---------------------------------------------------------------------------

interface AddRequirementModalProps {
  rules: RegulatoryRule[];
  onClose: () => void;
  onSuccess: (req: CompanyRequirement) => void;
}

function AddRequirementModal({ rules, onClose, onSuccess }: AddRequirementModalProps) {
  const [isPending, startTransition] = useTransition();
  const [reqId, setReqId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedRules, setSelectedRules] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  function toggleRule(reqIdVal: string) {
    setSelectedRules((prev) => {
      const next = new Set(prev);
      if (next.has(reqIdVal)) next.delete(reqIdVal);
      else next.add(reqIdVal);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createRequirement(
        reqId,
        title,
        description,
        Array.from(selectedRules),
      );

      if (!result.success) {
        setError(result.error ?? "An unknown error occurred.");
        return;
      }

      const optimisticRow: CompanyRequirement = {
        id: crypto.randomUUID(),
        requirement_id: reqId.trim(),
        title: title.trim(),
        description: description.trim() || null,
        created_at: new Date().toISOString(),
        rule_ids: Array.from(selectedRules),
      };

      setSucceeded(true);
      setTimeout(() => {
        onSuccess(optimisticRow);
        onClose();
      }, 600);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape" && !isPending) onClose();
  }

  return (
    <>
      <div
        aria-hidden="true"
        onClick={() => !isPending && onClose()}
        className="fixed inset-0 z-40 bg-zinc-900/40 backdrop-blur-[2px]"
      />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onKeyDown={handleKeyDown}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-req-modal-title"
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-lg rounded-2xl border border-zinc-200 bg-white shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
            <div>
              <h2 id="add-req-modal-title" className="text-sm font-bold tracking-tight text-zinc-900">
                Add New Requirement
              </h2>
              <p className="mt-0.5 text-xs text-zinc-400">IEC 62304 §5.2.6 — SRS traceability artefact</p>
            </div>
            <button
              type="button"
              onClick={() => !isPending && onClose()}
              aria-label="Close modal"
              disabled={isPending}
              className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <form onSubmit={handleSubmit} noValidate>
            <div className="space-y-4 px-6 py-5">
              <div className="space-y-1.5">
                <Label htmlFor="req-id" className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                  Requirement ID <span aria-hidden="true" className="text-red-500">*</span>
                </Label>
                <Input
                  id="req-id"
                  type="text"
                  placeholder="SRS-001"
                  value={reqId}
                  onChange={(e) => setReqId(e.target.value)}
                  disabled={isPending || succeeded}
                  maxLength={50}
                  autoComplete="off"
                  className="font-mono text-sm border-zinc-200 bg-white placeholder:text-zinc-300 focus-visible:ring-zinc-400"
                  aria-describedby="req-id-hint"
                />
                <p id="req-id-hint" className="text-[11px] text-zinc-400">
                  Alphanumeric, hyphens, underscores only — e.g. SRS-001, SDS-042
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="req-title" className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                  Title <span aria-hidden="true" className="text-red-500">*</span>
                </Label>
                <Input
                  id="req-title"
                  type="text"
                  placeholder="Short descriptive title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={isPending || succeeded}
                  maxLength={255}
                  className="text-sm border-zinc-200 bg-white placeholder:text-zinc-300 focus-visible:ring-zinc-400"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="req-desc" className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                  Description
                </Label>
                <textarea
                  id="req-desc"
                  placeholder="Full requirement text or acceptance criteria (optional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isPending || succeeded}
                  rows={3}
                  className="w-full resize-none rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                  Regulatory Mapping
                  {selectedRules.size > 0 && (
                    <span className="ml-2 rounded-full border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 font-normal normal-case text-[10px] text-zinc-600">
                      {selectedRules.size} selected
                    </span>
                  )}
                </Label>
                <RuleMultiSelect rules={rules} selected={selectedRules} onToggle={toggleRule} />
              </div>
              {error && (
                <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
              {succeeded && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  <p className="text-sm font-medium text-emerald-700">Requirement created.</p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-zinc-100 px-6 py-4">
              <button
                type="button"
                onClick={() => !isPending && onClose()}
                disabled={isPending}
                className="text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-600 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <Button
                type="submit"
                disabled={isPending || succeeded}
                className="inline-flex items-center gap-2 bg-zinc-900 text-sm text-white hover:bg-zinc-700 disabled:opacity-60"
              >
                {isPending ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</>
                ) : (
                  <><Plus className="h-3.5 w-3.5" />Add Requirement</>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Toast — lightweight inline notification (no external lib needed)
// ---------------------------------------------------------------------------

interface ToastProps {
  variant: "success" | "error";
  title: string;
  body?: string;
  onDismiss: () => void;
}

function Toast({ variant, title, body, onDismiss }: ToastProps) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 5000);
    return () => clearTimeout(id);
  }, [onDismiss]);

  const isSuccess = variant === "success";

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        "fixed bottom-5 right-5 z-[100] flex w-80 max-w-[calc(100vw-2.5rem)] items-start gap-3 rounded-xl border px-4 py-3 shadow-lg",
        isSuccess ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50",
      ].join(" ")}
    >
      {isSuccess ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
      )}
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${isSuccess ? "text-emerald-800" : "text-red-800"}`}>{title}</p>
        {body && (
          <p className={`mt-0.5 text-xs ${isSuccess ? "text-emerald-600" : "text-red-600"}`}>{body}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className={`shrink-0 rounded p-0.5 transition-colors ${
          isSuccess ? "text-emerald-400 hover:text-emerald-700" : "text-red-400 hover:text-red-700"
        }`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CSV parser — native File API, zero external dependencies.
// ---------------------------------------------------------------------------

const REQUIRED_HEADERS = ["requirement_id", "title"] as const;

function parseCSV(text: string): BulkImportRow[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const nonEmpty = lines.map((l) => l.trim()).filter(Boolean);

  if (nonEmpty.length < 2) {
    throw new Error("The CSV file appears to be empty or only contains a header row.");
  }

  const rawHeaders = nonEmpty[0]
    .split(",")
    .map((h) => h.trim().toLowerCase().replace(/^["']|["']$/g, ""));

  for (const required of REQUIRED_HEADERS) {
    if (!rawHeaders.includes(required)) {
      throw new Error(
        `Missing required column "${required}". Expected headers: requirement_id, title, description (optional).`,
      );
    }
  }

  const colIndex = (name: string) => rawHeaders.indexOf(name);

  const rows: BulkImportRow[] = [];
  for (let i = 1; i < nonEmpty.length; i++) {
    const cols = splitCSVLine(nonEmpty[i]);
    const requirement_id = (cols[colIndex("requirement_id")] ?? "").trim();
    const title = (cols[colIndex("title")] ?? "").trim();
    const descIdx = colIndex("description");
    const description = descIdx >= 0 ? (cols[descIdx] ?? "").trim() : "";
    if (!requirement_id && !title) continue;
    rows.push({ requirement_id, title, description: description || undefined });
  }

  if (rows.length === 0) {
    throw new Error("No data rows found after the header. Check your CSV content.");
  }

  return rows;
}

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ---------------------------------------------------------------------------
// ImportCSVModal
// ---------------------------------------------------------------------------

interface ImportCSVModalProps {
  onClose: () => void;
  onSuccess: (newReqs: CompanyRequirement[]) => void;
}

function ImportCSVModal({ onClose, onSuccess }: ImportCSVModalProps) {
  const [isPending, startTransition] = useTransition();
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<BulkImportRow[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape" && !isPending) onClose();
  }

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setParseError(null);
    setParsedRows(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setParseError("Please select a .csv file.");
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const rows = parseCSV(evt.target?.result as string);
        setParsedRows(rows);
      } catch (err) {
        setParseError(err instanceof Error ? err.message : "Failed to parse CSV.");
      }
    };
    reader.onerror = () => setParseError("Could not read the file. Please try again.");
    reader.readAsText(file);
  }, []);

  function handleImport() {
    if (!parsedRows || parsedRows.length === 0) return;

    startTransition(async () => {
      const result = await bulkImportRequirements(parsedRows);

      if (result.fatalError) {
        setParseError(result.fatalError);
        return;
      }

      const skippedIds = new Set(Object.keys(result.errors));
      const optimisticRows: CompanyRequirement[] = parsedRows
        .filter((r) => !skippedIds.has(r.requirement_id))
        .map((r) => ({
          id: crypto.randomUUID(),
          requirement_id: r.requirement_id,
          title: r.title,
          description: r.description ?? null,
          created_at: new Date().toISOString(),
          rule_ids: [],
        }));

      onSuccess(optimisticRows);
      onClose();
    });
  }

  return (
    <>
      <div
        aria-hidden="true"
        onClick={() => !isPending && onClose()}
        className="fixed inset-0 z-40 bg-zinc-900/40 backdrop-blur-[2px]"
      />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onKeyDown={handleKeyDown}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-csv-modal-title"
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-lg rounded-2xl border border-zinc-200 bg-white shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
            <div>
              <h2 id="import-csv-modal-title" className="text-sm font-bold tracking-tight text-zinc-900">
                Import Requirements via CSV
              </h2>
              <p className="mt-0.5 text-xs text-zinc-400">Bulk-upload SRS/SDS artefacts · IEC 62304 §5.2.6</p>
            </div>
            <button
              type="button"
              onClick={() => !isPending && onClose()}
              aria-label="Close modal"
              disabled={isPending}
              className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-5 px-6 py-5">
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2">Required CSV format</p>
              <pre className="overflow-x-auto rounded bg-white border border-zinc-200 px-3 py-2 font-mono text-[11px] text-zinc-700 leading-relaxed">
{`requirement_id,title,description
SRS-001,User Authentication,The system shall authenticate via OAuth2
SRS-002,Audit Logging,All events must be timestamped and immutable`}
              </pre>
              <p className="mt-2 text-[11px] text-zinc-400">
                <span className="font-semibold text-zinc-500">requirement_id</span> and{" "}
                <span className="font-semibold text-zinc-500">title</span> are required.{" "}
                Rows with duplicate IDs are skipped without aborting the import.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="csv-file-input" className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                Select CSV File <span aria-hidden="true" className="text-red-500">*</span>
              </Label>
              <label
                htmlFor="csv-file-input"
                className={[
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 transition-colors",
                  isPending
                    ? "cursor-not-allowed border-zinc-200 bg-zinc-50 opacity-60"
                    : parsedRows
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-zinc-200 bg-zinc-50 hover:border-zinc-300 hover:bg-zinc-100",
                ].join(" ")}
              >
                {parsedRows ? (
                  <>
                    <FileText className="h-6 w-6 text-emerald-500" />
                    <div className="text-center">
                      <p className="text-sm font-semibold text-emerald-700">{fileName}</p>
                      <p className="text-xs text-emerald-600">
                        {parsedRows.length} row{parsedRows.length !== 1 ? "s" : ""} ready to import
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <Upload className="h-6 w-6 text-zinc-400" />
                    <div className="text-center">
                      <p className="text-sm font-medium text-zinc-600">Click to select a CSV file</p>
                      <p className="text-xs text-zinc-400">.csv files only</p>
                    </div>
                  </>
                )}
              </label>
              <input
                ref={fileInputRef}
                id="csv-file-input"
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                disabled={isPending}
                className="sr-only"
              />
            </div>
            {parseError && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <p className="text-sm text-red-700">{parseError}</p>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-zinc-100 px-6 py-4">
            <button
              type="button"
              onClick={() => !isPending && onClose()}
              disabled={isPending}
              className="text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-600 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <Button
              type="button"
              onClick={handleImport}
              disabled={isPending || !parsedRows || parsedRows.length === 0}
              className="inline-flex items-center gap-2 bg-zinc-900 text-sm text-white hover:bg-zinc-700 disabled:opacity-60"
            >
              {isPending ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />Importing…</>
              ) : (
                <><Upload className="h-3.5 w-3.5" />Import {parsedRows && parsedRows.length > 0 ? `${parsedRows.length} Row${parsedRows.length !== 1 ? "s" : ""}` : "CSV"}</>
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// RequirementsClient — main exported component
// ---------------------------------------------------------------------------

export function RequirementsClient({
  initialRequirements,
  rules,
  userRole,
}: RequirementsClientProps) {
  const [requirements, setRequirements] = useState<CompanyRequirement[]>(initialRequirements);
  const [modalOpen, setModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [toast, setToast] = useState<{
    variant: "success" | "error";
    title: string;
    body?: string;
  } | null>(null);

  // RBAC visual gate — developer and viewer cannot create requirements.
  const canCreate = userRole === "admin" || userRole === "qa_manager";

  function handleSuccess(newReq: CompanyRequirement) {
    setRequirements((prev) =>
      [...prev, newReq].sort((a, b) => a.requirement_id.localeCompare(b.requirement_id)),
    );
  }

  function handleImportSuccess(newReqs: CompanyRequirement[]) {
    if (newReqs.length > 0) {
      setRequirements((prev) =>
        [...prev, ...newReqs].sort((a, b) => a.requirement_id.localeCompare(b.requirement_id)),
      );
    }
    setToast({
      variant: "success",
      title: `${newReqs.length} requirement${newReqs.length !== 1 ? "s" : ""} imported`,
      body: "The table has been updated. Any duplicate IDs were skipped.",
    });
  }

  return (
    <>
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-4 md:px-6">
          <div>
            <h2 className="text-sm font-semibold text-zinc-800">Requirements Register</h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              {requirements.length} requirement{requirements.length !== 1 ? "s" : ""} · IEC 62304 §5.2.6 traceability
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setImportModalOpen(true)}
              disabled={!canCreate}
              variant="outline"
              title={
                !canCreate
                  ? "Only Admins and QA Managers may import requirements."
                  : "Bulk import requirements from a CSV file"
              }
              className="inline-flex items-center gap-2 border-zinc-200 bg-white text-sm text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Import CSV</span>
            </Button>
            <Button
              onClick={() => setModalOpen(true)}
              disabled={!canCreate}
              title={
                !canCreate
                  ? "Only Admins and QA Managers may add requirements."
                  : "Add a new requirement"
              }
              className="inline-flex items-center gap-2 bg-zinc-900 text-sm text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Add Requirement</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        </div>

        {/* Empty state */}
        {requirements.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ClipboardList className="mb-3 h-10 w-10 text-zinc-300" />
            <p className="text-sm font-medium text-zinc-500">No requirements yet</p>
            <p className="mt-1 text-xs text-zinc-400">
              {canCreate
                ? 'Click "Add Requirement" or "Import CSV" to capture your first SRS artefact.'
                : "Contact your Admin or QA Manager to add requirements."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-zinc-50 hover:bg-zinc-50 border-b border-zinc-200">
                  <TableHead className="py-3 pl-4 md:pl-6 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 whitespace-nowrap">
                    Req. ID
                  </TableHead>
                  <TableHead className="py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Title
                  </TableHead>
                  <TableHead className="py-3 hidden md:table-cell text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Description
                  </TableHead>
                  <TableHead className="py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Regulatory Mapping
                  </TableHead>
                  <TableHead className="py-3 pr-4 md:pr-6 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500 whitespace-nowrap">
                    Created
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requirements.map((req) => (
                  <TableRow
                    key={req.id}
                    className="border-b border-zinc-100 last:border-b-0 hover:bg-slate-50"
                  >
                    <TableCell className="py-3 pl-4 md:pl-6">
                      <span className="inline-flex items-center rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-mono text-xs font-semibold text-zinc-800">
                        {req.requirement_id}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 max-w-[200px]">
                      <p className="truncate text-sm font-medium text-zinc-800" title={req.title}>
                        {req.title}
                      </p>
                    </TableCell>
                    <TableCell className="py-3 hidden md:table-cell max-w-[240px]">
                      {req.description ? (
                        <p className="line-clamp-2 text-xs text-zinc-500" title={req.description}>
                          {req.description}
                        </p>
                      ) : (
                        <span className="text-xs italic text-zinc-300">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3">
                      <MappingBadges ruleIds={req.rule_ids} rules={rules} />
                    </TableCell>
                    <TableCell className="py-3 pr-4 md:pr-6 text-right text-xs text-zinc-400 whitespace-nowrap">
                      {formatDate(req.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {modalOpen && (
        <AddRequirementModal
          rules={rules}
          onClose={() => setModalOpen(false)}
          onSuccess={handleSuccess}
        />
      )}

      {importModalOpen && (
        <ImportCSVModal
          onClose={() => setImportModalOpen(false)}
          onSuccess={handleImportSuccess}
        />
      )}

      {toast && (
        <Toast
          variant={toast.variant}
          title={toast.title}
          body={toast.body}
          onDismiss={() => setToast(null)}
        />
      )}
    </>
  );
}
