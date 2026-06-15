"use client";
// omnis-ui/components/setup-client.tsx
// CLI Integration Setup — interactive 3-step onboarding island.
//
// Step 1: Generate / surface an API key
// Step 2: Download the correct binary for the user's OS
// Step 3: Run the first test — polling loop watches for log count > 0
//
// Props come from the server component (setup/page.tsx), which pre-fetches
// the initial API key and log count to avoid a blank flash on first load.

import { useState, useEffect, useRef, useTransition, useCallback } from "react";
import Link from "next/link";
import {
  Key,
  Download,
  Terminal,
  CheckCircle2,
  Copy,
  Check,
  Loader2,
  ArrowRight,
  AlertTriangle,
  Plus,
  Apple,
  Monitor,
  ExternalLink,
  RefreshCw,
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
import { generateApiKey, type ApiKeyRow } from "@/app/dashboard/settings/actions";
import { getOrgLogCount } from "@/app/dashboard/setup/actions";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Polling interval while waiting for the first evidence log (ms). */
const POLL_INTERVAL_MS = 5_000;

/** GitHub Releases base URL — update to the real release tag when published. */
const RELEASES_BASE = "https://github.com/your-org/omnis-cli/releases/latest/download";

const BINARIES = {
  windows: { label: "Windows (.exe)", file: "omnis-run-win.exe", icon: Monitor },
  mac:     { label: "macOS (Apple Silicon)", file: "omnis-run-mac", icon: Apple },
  linux:   { label: "Linux (x64)", file: "omnis-run-linux", icon: Terminal },
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SetupClientProps {
  initialFirstKey: ApiKeyRow | null;
  initialLogCount: number;
  initError?: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Step number badge — filled when complete, ring when active, grey when future. */
function StepBadge({
  step,
  current,
  done,
}: {
  step: number;
  current: number;
  done: boolean;
}) {
  if (done) {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500">
        <CheckCircle2 className="h-4 w-4 text-white" strokeWidth={2.5} />
      </div>
    );
  }
  if (step === current) {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white text-xs font-bold dark:bg-zinc-100 dark:text-zinc-900">
        {step}
      </div>
    );
  }
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-zinc-200 text-zinc-400 text-xs font-bold dark:border-zinc-700">
      {step}
    </div>
  );
}

/** Inline copy button for code blocks. */
function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be unavailable in some browsers */
    }
  }

  return (
    <button
      onClick={handleCopy}
      aria-label={copied ? "Copied" : (label ?? "Copy to clipboard")}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-800 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" strokeWidth={2.5} />
      ) : (
        <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
      )}
    </button>
  );
}

/** Inline code block with a copy button. */
function CodeBlock({ code }: { code: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-800/60">
      <code className="flex-1 overflow-x-auto whitespace-pre font-mono text-sm text-zinc-800 dark:text-zinc-200 select-all">
        {code}
      </code>
      <CopyButton value={code} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SetupClient({
  initialFirstKey,
  initialLogCount,
  initError,
}: SetupClientProps) {
  // ── Step tracking ─────────────────────────────────────────────────────────
  // Step 1 is "done" if the user already has at least one API key.
  // Step 3 is "done" when logCount > 0.
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(
    initialFirstKey ? 2 : 1
  );
  const [step1Done, setStep1Done] = useState(!!initialFirstKey);
  const [step2Done, setStep2Done] = useState(false);
  const [logCount, setLogCount] = useState(initialLogCount);
  const logDetected = logCount > 0;

  // ── API key state ─────────────────────────────────────────────────────────
  const [activeKey, setActiveKey] = useState<ApiKeyRow | null>(initialFirstKey);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [keyNameError, setKeyNameError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [isGenerating, startGenerating] = useTransition();
  const nameInputRef = useRef<HTMLInputElement>(null);

  // ── Polling ───────────────────────────────────────────────────────────────
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const startPolling = useCallback(() => {
    if (pollingRef.current) return; // already polling
    setIsPolling(true);
    pollingRef.current = setInterval(async () => {
      const result = await getOrgLogCount();
      if (result.logCount > 0) {
        setLogCount(result.logCount);
        stopPolling();
      }
    }, POLL_INTERVAL_MS);
  }, [stopPolling]);

  // Start polling automatically when the user reaches step 3
  useEffect(() => {
    if (activeStep === 3 && !logDetected) {
      startPolling();
    }
    return () => stopPolling();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep]);

  // Stop polling as soon as a log is detected
  useEffect(() => {
    if (logDetected) stopPolling();
  }, [logDetected, stopPolling]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function openGenerateModal() {
    setKeyName("");
    setKeyNameError(null);
    setGenerateError(null);
    setShowGenerateModal(true);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  }

  function closeGenerateModal() {
    setShowGenerateModal(false);
    setKeyName("");
    setKeyNameError(null);
    setGenerateError(null);
  }

  function handleGenerate() {
    const trimmed = keyName.trim();
    if (!trimmed) {
      setKeyNameError("Please enter a name for this key.");
      return;
    }
    if (trimmed.length > 120) {
      setKeyNameError("Name must be 120 characters or fewer.");
      return;
    }
    setKeyNameError(null);
    setGenerateError(null);

    startGenerating(async () => {
      const result = await generateApiKey(trimmed);
      if (!result.success || !result.rawKey) {
        setGenerateError(result.error ?? "Generation failed. Please try again.");
        return;
      }
      closeGenerateModal();
      setRevealedKey(result.rawKey);
      const now = new Date().toISOString();
      const newKey: ApiKeyRow = {
        id: `temp-${now}`,
        name: trimmed,
        key_prefix: result.rawKey.slice(0, 8),
        created_at: now,
      };
      setActiveKey(newKey);
      setStep1Done(true);
      setActiveStep(2);
    });
  }

  function dismissRevealModal() {
    setRevealedKey(null);
  }

  function handleStep2Continue() {
    setStep2Done(true);
    setActiveStep(3);
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  // The snippet shown in Step 3 uses the revealed key if available,
  // otherwise the stored prefix (key never shown again after dismiss).
  const keyForSnippet = revealedKey ?? `${activeKey?.key_prefix ?? "omn_"}…`;
  const firstTestSnippet = [
    `# Set your API key (once per shell session)`,
    `export OMNIS_API_KEY=${keyForSnippet}`,
    ``,
    `# Run your first test`,
    `./omnis-run --results ./test-output.json`,
  ].join("\n");

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Connect the CLI
        </h2>
        <p className="mt-2 text-sm text-zinc-400">
          Three steps to send your first evidence log to the Omnis platform.
        </p>
      </div>

      {initError && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {initError}
        </div>
      )}

      {/* ── Progress bar ────────────────────────────────────────────────── */}
      <div className="mb-8 flex items-center gap-2">
        <StepBadge step={1} current={activeStep} done={step1Done} />
        <div
          className={`h-px flex-1 transition-colors duration-500 ${
            step1Done ? "bg-emerald-400" : "bg-zinc-200 dark:bg-zinc-700"
          }`}
        />
        <StepBadge step={2} current={activeStep} done={step2Done} />
        <div
          className={`h-px flex-1 transition-colors duration-500 ${
            step2Done ? "bg-emerald-400" : "bg-zinc-200 dark:bg-zinc-700"
          }`}
        />
        <StepBadge step={3} current={activeStep} done={logDetected} />
      </div>

      {/* ── Step 1: API Key ──────────────────────────────────────────────── */}
      <Card
        className={`mb-4 border transition-colors ${
          activeStep === 1
            ? "border-zinc-900 shadow-md dark:border-zinc-100"
            : "border-zinc-200 dark:border-zinc-800"
        } dark:bg-zinc-900`}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                step1Done
                  ? "bg-emerald-100 dark:bg-emerald-950/60"
                  : "bg-zinc-100 dark:bg-zinc-800"
              }`}
            >
              <Key
                className={`h-4 w-4 ${
                  step1Done
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-zinc-500"
                }`}
                strokeWidth={1.75}
              />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                Step 1 — Generate an API Key
              </CardTitle>
              <CardDescription className="text-xs text-zinc-400">
                The CLI uses this key to authenticate evidence submissions.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {step1Done && activeKey ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 dark:border-emerald-800/50 dark:bg-emerald-950/30">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" strokeWidth={2} />
                <div>
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {activeKey.name}
                  </p>
                  <code className="text-xs font-mono text-zinc-500">
                    {activeKey.key_prefix}…
                  </code>
                </div>
              </div>
              <Link
                href="/dashboard/settings"
                className="text-xs text-zinc-400 underline-offset-2 hover:underline flex items-center gap-1"
              >
                Manage keys
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                You don&apos;t have an active API key yet. Generate one to get started.
                You can also manage keys from{" "}
                <Link
                  href="/dashboard/settings"
                  className="font-medium text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"
                >
                  Settings
                </Link>
                .
              </p>
              <Button
                size="sm"
                onClick={openGenerateModal}
                className="bg-zinc-900 text-zinc-50 hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" strokeWidth={2} />
                Generate API Key
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Step 2: Download CLI ─────────────────────────────────────────── */}
      <Card
        className={`mb-4 border transition-colors ${
          activeStep === 2
            ? "border-zinc-900 shadow-md dark:border-zinc-100"
            : "border-zinc-200 dark:border-zinc-800"
        } dark:bg-zinc-900`}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                step2Done
                  ? "bg-emerald-100 dark:bg-emerald-950/60"
                  : "bg-zinc-100 dark:bg-zinc-800"
              }`}
            >
              <Download
                className={`h-4 w-4 ${
                  step2Done
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-zinc-500"
                }`}
                strokeWidth={1.75}
              />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                Step 2 — Install the CLI
              </CardTitle>
              <CardDescription className="text-xs text-zinc-400">
                Download the binary for your operating system. No runtime required.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0 space-y-3">
          {/* Binary download buttons */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(Object.entries(BINARIES) as [keyof typeof BINARIES, typeof BINARIES[keyof typeof BINARIES]][]).map(
              ([key, { label, file, icon: Icon }]) => (
                <a
                  key={key}
                  href={`${RELEASES_BASE}/${file}`}
                  download={file}
                  onClick={() => {
                    // Mark step 2 as progressed when any binary is clicked
                    if (!step2Done && step1Done) setStep2Done(false); // will be set on "continue"
                  }}
                  className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-700"
                >
                  <Icon className="h-4 w-4 text-zinc-400 shrink-0" strokeWidth={1.5} />
                  <span className="flex-1 leading-tight">{label}</span>
                  <Download className="h-3.5 w-3.5 text-zinc-400" strokeWidth={1.75} />
                </a>
              )
            )}
          </div>

          {/* macOS chmod reminder */}
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5 dark:border-amber-800/40 dark:bg-amber-950/20">
            <p className="text-xs text-amber-800 dark:text-amber-300">
              <span className="font-semibold">macOS / Linux:</span> make the
              binary executable after download:
            </p>
            <CodeBlock code="chmod +x ./omnis-run-mac    # or omnis-run-linux" />
          </div>

          {step1Done && !step2Done && (
            <Button
              size="sm"
              onClick={handleStep2Continue}
              className="w-full sm:w-auto bg-zinc-900 text-zinc-50 hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              I&apos;ve downloaded it
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          )}

          {step2Done && (
            <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
              Binary downloaded — ready to run your first test.
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Step 3: Run first test ───────────────────────────────────────── */}
      <Card
        className={`mb-8 border transition-colors ${
          activeStep === 3
            ? "border-zinc-900 shadow-md dark:border-zinc-100"
            : "border-zinc-200 dark:border-zinc-800"
        } dark:bg-zinc-900`}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                logDetected
                  ? "bg-emerald-100 dark:bg-emerald-950/60"
                  : "bg-zinc-100 dark:bg-zinc-800"
              }`}
            >
              <Terminal
                className={`h-4 w-4 ${
                  logDetected
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-zinc-500"
                }`}
                strokeWidth={1.75}
              />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                Step 3 — Run Your First Test
              </CardTitle>
              <CardDescription className="text-xs text-zinc-400">
                Copy and run the snippet below in your terminal. The page will
                update automatically when a log is received.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0 space-y-4">
          {/* Command snippet */}
          <div>
            <CodeBlock code={firstTestSnippet} />
            {revealedKey && (
              <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Your full key is shown above — copy it now. It won&apos;t be shown again after you leave this page.
              </p>
            )}
          </div>

          {/* Polling status */}
          {!logDetected ? (
            <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-800/40">
              {isPolling ? (
                <>
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-zinc-400" />
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Waiting for your first evidence log… polling every 5 s
                  </p>
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 shrink-0 text-zinc-400" />
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Complete steps 1 &amp; 2, then run the snippet above.
                    Polling will start automatically.
                  </p>
                </>
              )}
            </div>
          ) : (
            /* ── Success state ─────────────────────────────────────────── */
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-4 text-center dark:border-emerald-700/50 dark:bg-emerald-950/40">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500" strokeWidth={1.75} />
              <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                First evidence log received!
              </p>
              <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
                {logCount} log{logCount !== 1 ? "s" : ""} in your compliance ledger.
                Your integration is live.
              </p>
              <Button
                asChild
                size="sm"
                className="mt-4 bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <Link href="/dashboard">
                  Enter Dashboard
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Skip link for users who already have logs ────────────────────── */}
      {!logDetected && (
        <p className="text-center text-xs text-zinc-400">
          Already have evidence logs?{" "}
          <Link
            href="/dashboard"
            className="font-medium text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
          >
            Go to Dashboard →
          </Link>
        </p>
      )}

      {/* ── Generate Key modal ───────────────────────────────────────────── */}
      {showGenerateModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="setup-generate-key-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="absolute inset-0 bg-black/40 dark:bg-black/60"
            onClick={closeGenerateModal}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
                <Key className="h-4 w-4 text-zinc-600 dark:text-zinc-300" strokeWidth={1.75} />
              </div>
              <div>
                <h2
                  id="setup-generate-key-title"
                  className="text-base font-semibold text-zinc-900 dark:text-zinc-100"
                >
                  New API Key
                </h2>
                <p className="text-xs text-zinc-400">
                  Give this key a name so you can identify it later.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="setup-api-key-name"
                className="text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Key Name
              </Label>
              <Input
                id="setup-api-key-name"
                ref={nameInputRef}
                type="text"
                value={keyName}
                onChange={(e) => {
                  setKeyName(e.target.value);
                  if (keyNameError) setKeyNameError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleGenerate();
                  if (e.key === "Escape") closeGenerateModal();
                }}
                placeholder="e.g. Local Dev · MacBook Pro"
                maxLength={120}
                className="h-9 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                aria-describedby={keyNameError ? "setup-key-name-error" : undefined}
                aria-invalid={!!keyNameError}
              />
              {keyNameError && (
                <p
                  id="setup-key-name-error"
                  role="alert"
                  className="text-[11px] text-red-500"
                >
                  {keyNameError}
                </p>
              )}
            </div>

            {generateError && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {generateError}
              </div>
            )}

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

      {/* ── Show-once key reveal modal ───────────────────────────────────── */}
      {revealedKey && !showGenerateModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="setup-reveal-key-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div className="absolute inset-0 bg-black/50 dark:bg-black/70" aria-hidden="true" />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-600/40 dark:bg-amber-950/40">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" strokeWidth={2} />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  Copy this key now — it will never be shown again
                </p>
                <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                  The full key is not stored anywhere in Omnis. Once you close
                  this dialog you cannot retrieve it. If you lose it, revoke it
                  and generate a new one.
                </p>
              </div>
            </div>

            <h2
              id="setup-reveal-key-title"
              className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-100"
            >
              Your New API Key
            </h2>

            <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
              <code className="flex-1 select-all overflow-x-auto whitespace-nowrap font-mono text-sm text-zinc-800 dark:text-zinc-200">
                {revealedKey}
              </code>
              <CopyButton value={revealedKey} label="Copy API key" />
            </div>

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
