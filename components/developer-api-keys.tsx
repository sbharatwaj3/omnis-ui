"use client";
// omnis-ui/components/developer-api-keys.tsx
// Developer API Keys management panel for the Settings page.
//
// Responsibilities:
//   1. Display the table of active API keys (name, prefix, created_at, revoke).
//   2. "Generate New API Key" button → name prompt modal → generation → show-once modal.
//      Only qa_manager and developer roles can generate keys.
//      Viewers see a locked, disabled state with a clear explanation.
//   3. "Show Once" modal: displays the raw key with a copy button and a strict
//      security warning. The raw key is never stored in component state beyond
//      this modal's lifetime — it is cleared when the modal is dismissed.
//
// The actual DB writes happen exclusively in Server Actions (actions.ts).
// This component only manages UI state and surfaces results.

import { useState, useTransition, useRef } from "react";
import {
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  Loader2,
  AlertTriangle,
  X,
  Terminal,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { generateApiKey, revokeApiKey, type ApiKeyRow } from "@/app/dashboard/settings/actions";
import { useUserRole } from "@/hooks/useUserRole";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeveloperApiKeysProps {
  initialKeys: ApiKeyRow[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DeveloperApiKeys({ initialKeys }: DeveloperApiKeysProps) {
  // Active key list — updated optimistically on revoke
  const [keys, setKeys] = useState<ApiKeyRow[]>(initialKeys);

  // Resolve the current user's RBAC role
  const { role } = useUserRole();
  const canManageKeys = role === "qa_manager" || role === "developer";

  // ── Generate modal state ────────────────────────────────────────────────
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [isGenerating, startGenerating] = useTransition();

  // ── Show-once modal state ───────────────────────────────────────────────
  // rawKey is held in state only for the duration the modal is open.
  // It is set to null when the modal is dismissed.
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ── Revoke state ────────────────────────────────────────────────────────
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  // Focus ref for the name input when the modal opens
  const nameInputRef = useRef<HTMLInputElement>(null);

  // ── Handlers ────────────────────────────────────────────────────────────

  function openGenerateModal() {
    setKeyName("");
    setNameError(null);
    setGenerateError(null);
    setShowGenerateModal(true);
    // Focus the input on next tick (after the modal renders)
    setTimeout(() => nameInputRef.current?.focus(), 50);
  }

  function closeGenerateModal() {
    setShowGenerateModal(false);
    setKeyName("");
    setNameError(null);
    setGenerateError(null);
  }

  function dismissRevealModal() {
    // Clear the raw key from memory immediately on dismiss
    setRevealedKey(null);
    setCopied(false);
  }

  async function handleGenerate() {
    const trimmed = keyName.trim();
    if (!trimmed) {
      setNameError("Please enter a name for this key.");
      return;
    }
    if (trimmed.length > 120) {
      setNameError("Name must be 120 characters or fewer.");
      return;
    }
    setNameError(null);
    setGenerateError(null);

    startGenerating(async () => {
      const result = await generateApiKey(trimmed);
      if (!result.success || !result.rawKey) {
        setGenerateError(result.error ?? "Generation failed. Please try again.");
        return;
      }

      // Close the name prompt and open the show-once modal
      setShowGenerateModal(false);
      setRevealedKey(result.rawKey);

      // Optimistically prepend the new key to the table.
      // The server action called revalidatePath, so the next navigation
      // will fetch the real row; this just avoids a full page reload.
      const now = new Date().toISOString();
      const prefix = result.rawKey.slice(0, 8);
      const placeholder: ApiKeyRow = {
        id: `temp-${now}`,
        name: trimmed,
        key_prefix: prefix,
        created_at: now,
      };
      setKeys((prev) => [placeholder, ...prev]);
    });
  }

  async function handleRevoke(keyId: string) {
    setRevokingId(keyId);
    setRevokeError(null);

    // Optimistically remove from the list
    setKeys((prev) => prev.filter((k) => k.id !== keyId));

    const result = await revokeApiKey(keyId);
    if (!result.success) {
      // Restore the list on failure
      setRevokeError(result.error ?? "Revoke failed.");
      // Re-fetch is handled by the next revalidatePath-triggered render;
      // for now just clear the revoking state.
    }
    setRevokingId(null);
  }

  async function handleCopy() {
    if (!revealedKey) return;
    try {
      await navigator.clipboard.writeText(revealedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the text manually
      const el = document.getElementById("omnis-raw-key-display");
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Developer APIs card ─────────────────────────────────────────── */}
      <Card className="border-zinc-200 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                <Key className="h-4 w-4 text-zinc-500" strokeWidth={1.75} />
                API Keys
              </CardTitle>
              <CardDescription className="mt-1 text-xs text-zinc-400">
                Generate keys that allow your CI/CD pipeline to send test
                evidence to the Omnis platform. Each key is shown only once.
              </CardDescription>
            </div>
            {canManageKeys ? (
              <Button
                size="sm"
                onClick={openGenerateModal}
                className="shrink-0 bg-zinc-900 text-zinc-50 hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" strokeWidth={2} />
                Generate New Key
              </Button>
            ) : (
              <div
                title="Role: Viewer — only QA Managers and Developers can generate API keys"
                className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 opacity-60 cursor-not-allowed shrink-0 dark:border-zinc-700 dark:bg-zinc-800"
              >
                <Lock className="h-3.5 w-3.5 text-zinc-400" />
                <span className="text-xs font-medium text-zinc-500">Generate New Key</span>
              </div>
            )}
          </div>

          {/* Viewer notice */}
          {role === "viewer" && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-700/40 dark:bg-amber-950/30">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                <span className="font-semibold">Read-only access.</span> Your Viewer
                role cannot generate or revoke API keys. Contact a QA Manager or
                Developer to manage credentials.
              </p>
            </div>
          )}
        </CardHeader>

        <CardContent className="pt-0">
          {/* Error banner for revoke failures */}
          {revokeError && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {revokeError}
            </div>
          )}

          {/* Key table */}
          {keys.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-200 bg-zinc-50/60 py-10 text-center dark:border-zinc-700 dark:bg-zinc-800/30">
              <Terminal className="h-6 w-6 text-zinc-300 dark:text-zinc-600" strokeWidth={1.5} />
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                No API keys yet
              </p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                Generate your first key to connect a CI/CD pipeline.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/60">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Name
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Key Prefix
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Created
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {keys.map((key) => (
                    <tr
                      key={key.id}
                      className="transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40"
                    >
                      <td className="px-4 py-3 font-medium text-zinc-800 dark:text-zinc-200">
                        {key.name}
                      </td>
                      <td className="px-4 py-3">
                        <code className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                          {key.key_prefix}…
                        </code>
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-400">
                        {new Date(key.created_at).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canManageKeys ? (
                          <button
                            onClick={() => handleRevoke(key.id)}
                            disabled={revokingId === key.id}
                            aria-label={`Revoke key ${key.name}`}
                            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                          >
                            {revokingId === key.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" strokeWidth={1.75} />
                            )}
                            Revoke
                          </button>
                        ) : (
                          <span
                            title="Requires QA Manager or Developer role"
                            className="inline-flex items-center gap-1 text-xs text-zinc-300 cursor-not-allowed dark:text-zinc-600"
                          >
                            <Lock className="h-3 w-3" />
                            Revoke
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Generate modal: name prompt ─────────────────────────────────── */}
      {showGenerateModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="generate-key-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 dark:bg-black/60"
            onClick={closeGenerateModal}
            aria-hidden="true"
          />

          {/* Panel */}
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            {/* Close button */}
            <button
              onClick={closeGenerateModal}
              aria-label="Close"
              className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </button>

            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
                <Key className="h-4 w-4 text-zinc-600 dark:text-zinc-300" strokeWidth={1.75} />
              </div>
              <div>
                <h2
                  id="generate-key-title"
                  className="text-base font-semibold text-zinc-900 dark:text-zinc-100"
                >
                  New API Key
                </h2>
                <p className="text-xs text-zinc-400">
                  Give this key a descriptive name so you can identify it later.
                </p>
              </div>
            </div>

            {/* Name field */}
            <div className="space-y-1.5">
              <Label
                htmlFor="api-key-name"
                className="text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Key Name
              </Label>
              <Input
                id="api-key-name"
                ref={nameInputRef}
                type="text"
                value={keyName}
                onChange={(e) => {
                  setKeyName(e.target.value);
                  if (nameError) setNameError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleGenerate();
                  if (e.key === "Escape") closeGenerateModal();
                }}
                placeholder="e.g. GitHub Actions · Main Branch"
                maxLength={120}
                className="h-9 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                aria-describedby={nameError ? "key-name-error" : undefined}
                aria-invalid={!!nameError}
              />
              {nameError && (
                <p
                  id="key-name-error"
                  role="alert"
                  className="text-[11px] text-red-500"
                >
                  {nameError}
                </p>
              )}
            </div>

            {/* Server error */}
            {generateError && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {generateError}
              </div>
            )}

            {/* Actions */}
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={closeGenerateModal}
                disabled={isGenerating}
                className="text-zinc-600 dark:border-zinc-600 dark:text-zinc-300"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="bg-zinc-900 text-zinc-50 hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Generating…
                  </>
                ) : (
                  "Generate Key"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Show-once modal: reveal raw key ─────────────────────────────── */}
      {revealedKey && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reveal-key-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          {/* Backdrop — intentionally NOT clickable to dismiss, to force the
              user to acknowledge the warning before closing */}
          <div
            className="absolute inset-0 bg-black/50 dark:bg-black/70"
            aria-hidden="true"
          />

          {/* Panel */}
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            {/* Warning banner */}
            <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-600/40 dark:bg-amber-950/40">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                strokeWidth={2}
              />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  Copy this key now — it will never be shown again
                </p>
                <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                  For your security, the full API key is not stored anywhere in
                  Omnis. Once you close this dialog, you cannot retrieve it. If
                  you lose it, you must revoke this key and generate a new one.
                </p>
              </div>
            </div>

            <h2
              id="reveal-key-title"
              className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-100"
            >
              Your New API Key
            </h2>

            {/* Key display */}
            <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
              <code
                id="omnis-raw-key-display"
                className="flex-1 select-all overflow-x-auto whitespace-nowrap font-mono text-sm text-zinc-800 dark:text-zinc-200"
                aria-label="API key value"
              >
                {revealedKey}
              </code>
              <button
                onClick={handleCopy}
                aria-label={copied ? "Copied" : "Copy to clipboard"}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 transition-all hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-800 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" strokeWidth={2.5} />
                ) : (
                  <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                )}
              </button>
            </div>

            {copied && (
              <p className="mt-2 text-right text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                Copied to clipboard
              </p>
            )}

            {/* Dismiss */}
            <div className="mt-5 flex justify-end">
              <Button
                size="sm"
                onClick={dismissRevealModal}
                className="bg-zinc-900 text-zinc-50 hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                I have copied my key — close
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
