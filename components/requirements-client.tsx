"use client";
// omnis-ui/components/requirements-client.tsx
// Requirements Management — Interactive client layer.
//
// Responsibilities:
//   1. Data table displaying all company_requirements rows.
//   2. "Add New Requirement" modal with form inputs + regulatory clause multi-select.
//   3. Calls createRequirement server action and refreshes the table on success.
//
// CONSTITUTION LAW VII:
//   - RBAC visual enforcement: Add button is disabled for developer/viewer roles.
//     The server action independently re-enforces this gate.
//   - Light mode only — no dark: variants used anywhere.

import { useState, useTransition, useMemo } from "react";
import {
  createRequirement,
  type CompanyRequirement,
  type RegulatoryClause,
} from "@/app/dashboard/requirements/actions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RequirementsClientProps {
  initialRequirements: CompanyRequirement[];
  clauses: RegulatoryClause[];
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

/** Groups clauses by standard_name for a cleaner multi-select UI. */
function groupClausesByStandard(
  clauses: RegulatoryClause[],
): Map<string, RegulatoryClause[]> {
  const map = new Map<string, RegulatoryClause[]>();
  for (const clause of clauses) {
    const bucket = map.get(clause.standard_name);
    if (bucket) bucket.push(clause);
    else map.set(clause.standard_name, [clause]);
  }
  return map;
}

// ---------------------------------------------------------------------------
// MappingBadges — renders compact clause badges for a requirement row
// ---------------------------------------------------------------------------

function MappingBadges({
  clauseIds,
  clauses,
}: {
  clauseIds: string[];
  clauses: RegulatoryClause[];
}) {
  if (clauseIds.length === 0) {
    return <span className="text-xs text-zinc-400 italic">—</span>;
  }

  const clauseMap = useMemo(() => {
    const m = new Map<string, RegulatoryClause>();
    for (const c of clauses) m.set(c.id, c);
    return m;
  }, [clauses]);

  const MAX_VISIBLE = 2;
  const visible = clauseIds.slice(0, MAX_VISIBLE);
  const overflow = clauseIds.length - MAX_VISIBLE;

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((id) => {
        const c = clauseMap.get(id);
        if (!c) return null;
        return (
          <span
            key={id}
            title={`${c.standard_name} — ${c.description ?? ""}`}
            className="inline-flex items-center rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600"
          >
            {c.clause_number}
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
// ClauseMultiSelect — grouped checkbox list for regulatory clause selection
// ---------------------------------------------------------------------------

interface ClauseMultiSelectProps {
  clauses: RegulatoryClause[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}

function ClauseMultiSelect({ clauses, selected, onToggle }: ClauseMultiSelectProps) {
  const [openStandards, setOpenStandards] = useState<Set<string>>(
    () => new Set(Array.from(groupClausesByStandard(clauses).keys())),
  );

  const grouped = useMemo(() => groupClausesByStandard(clauses), [clauses]);

  function toggleStandard(name: string) {
    setOpenStandards((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  if (clauses.length === 0) {
    return (
      <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-400">
        No regulatory clauses found. Seed them via the database.
      </p>
    );
  }

  return (
    <div className="max-h-56 overflow-y-auto rounded-lg border border-zinc-200 bg-white">
      {Array.from(grouped.entries()).map(([standard, items]) => {
        const isOpen = openStandards.has(standard);
        const selectedInGroup = items.filter((c) => selected.has(c.id)).length;
        return (
          <div key={standard} className="border-b border-zinc-100 last:border-b-0">
            {/* Group header */}
            <button
              type="button"
              onClick={() => toggleStandard(standard)}
              className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400"
            >
              <span className="text-xs font-semibold text-zinc-700">{standard}</span>
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
            {/* Clause rows */}
            {isOpen && (
              <div className="divide-y divide-zinc-50 bg-zinc-50/50">
                {items.map((clause) => {
                  const checked = selected.has(clause.id);
                  return (
                    <label
                      key={clause.id}
                      className="flex cursor-pointer items-start gap-3 px-4 py-2 hover:bg-zinc-100"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggle(clause.id)}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-zinc-900"
                      />
                      <div className="min-w-0">
                        <span className="font-mono text-xs font-semibold text-zinc-800">
                          {clause.clause_number}
                        </span>
                        {clause.description && (
                          <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500 line-clamp-2">
                            {clause.description}
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
// AddRequirementModal — centered modal with form + clause multi-select
// ---------------------------------------------------------------------------

interface AddRequirementModalProps {
  clauses: RegulatoryClause[];
  onClose: () => void;
  onSuccess: (req: CompanyRequirement) => void;
}

function AddRequirementModal({
  clauses,
  onClose,
  onSuccess,
}: AddRequirementModalProps) {
  const [isPending, startTransition] = useTransition();
  const [reqId, setReqId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedClauses, setSelectedClauses] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  function toggleClause(id: string) {
    setSelectedClauses((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
        Array.from(selectedClauses),
      );

      if (!result.success) {
        setError(result.error ?? "An unknown error occurred.");
        return;
      }

      // Build a synthetic row to hand back so the table updates immediately
      // without a full page reload. The server revalidation handles the
      // persistent cache; this is a local optimistic update for UX.
      const optimisticRow: CompanyRequirement = {
        id: crypto.randomUUID(),
        requirement_id: reqId.trim(),
        title: title.trim(),
        description: description.trim() || null,
        created_at: new Date().toISOString(),
        clause_ids: Array.from(selectedClauses),
      };

      setSucceeded(true);
      // Brief success flash before closing
      setTimeout(() => {
        onSuccess(optimisticRow);
        onClose();
      }, 600);
    });
  }

  // Close on Escape
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape" && !isPending) onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={() => !isPending && onClose()}
        className="fixed inset-0 z-40 bg-zinc-900/40 backdrop-blur-[2px]"
      />

      {/* Modal panel */}
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
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
            <div>
              <h2
                id="add-req-modal-title"
                className="text-sm font-bold tracking-tight text-zinc-900"
              >
                Add New Requirement
              </h2>
              <p className="mt-0.5 text-xs text-zinc-400">
                IEC 62304 §5.2.6 — SRS traceability artefact
              </p>
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

          {/* Body */}
          <form onSubmit={handleSubmit} noValidate>
            <div className="space-y-4 px-6 py-5">
              {/* Requirement ID */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="req-id"
                  className="text-xs font-semibold uppercase tracking-widest text-zinc-500"
                >
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

              {/* Title */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="req-title"
                  className="text-xs font-semibold uppercase tracking-widest text-zinc-500"
                >
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

              {/* Description */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="req-desc"
                  className="text-xs font-semibold uppercase tracking-widest text-zinc-500"
                >
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

              {/* Regulatory mapping */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                  Regulatory Mapping
                  {selectedClauses.size > 0 && (
                    <span className="ml-2 rounded-full border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 font-normal normal-case text-[10px] text-zinc-600">
                      {selectedClauses.size} selected
                    </span>
                  )}
                </Label>
                <ClauseMultiSelect
                  clauses={clauses}
                  selected={selectedClauses}
                  onToggle={toggleClause}
                />
              </div>

              {/* Error banner */}
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Success flash */}
              {succeeded && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  <p className="text-sm font-medium text-emerald-700">Requirement created.</p>
                </div>
              )}
            </div>

            {/* Footer */}
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
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" />
                    Add Requirement
                  </>
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
// RequirementsClient — main exported component
// ---------------------------------------------------------------------------

export function RequirementsClient({
  initialRequirements,
  clauses,
  userRole,
}: RequirementsClientProps) {
  const [requirements, setRequirements] = useState<CompanyRequirement[]>(initialRequirements);
  const [modalOpen, setModalOpen] = useState(false);

  // RBAC visual gate — developer and viewer cannot create requirements.
  // The server action enforces this independently; this is the UI layer gate
  // per Constitution §VII.
  const canCreate = userRole === "admin" || userRole === "qa_manager";

  function handleSuccess(newReq: CompanyRequirement) {
    // Optimistic local update — server revalidation handles persistence.
    setRequirements((prev) =>
      [...prev, newReq].sort((a, b) =>
        a.requirement_id.localeCompare(b.requirement_id),
      ),
    );
  }

  return (
    <>
      {/* Table card */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
        {/* Table toolbar */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-4 md:px-6">
          <div>
            <h2 className="text-sm font-semibold text-zinc-800">
              Requirements Register
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              {requirements.length} requirement{requirements.length !== 1 ? "s" : ""} · IEC 62304 §5.2.6 traceability
            </p>
          </div>
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

        {/* Empty state */}
        {requirements.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ClipboardList className="mb-3 h-10 w-10 text-zinc-300" />
            <p className="text-sm font-medium text-zinc-500">No requirements yet</p>
            <p className="mt-1 text-xs text-zinc-400">
              {canCreate
                ? 'Click "Add Requirement" to capture your first SRS artefact.'
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
                      <MappingBadges clauseIds={req.clause_ids} clauses={clauses} />
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

      {/* Modal */}
      {modalOpen && (
        <AddRequirementModal
          clauses={clauses}
          onClose={() => setModalOpen(false)}
          onSuccess={handleSuccess}
        />
      )}
    </>
  );
}
