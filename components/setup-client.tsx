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
import { motion, AnimatePresence } from "framer-motion";
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

// Binaries are hosted on GitHub Releases.
// When a new CLI version is tagged, upload the three dist/ files to the
// release and they will be served at these URLs automatically.
const RELEASES_BASE =
  "https://github.com/sbharatwaj3/omnis-cli/releases/latest/download";

const BINARIES = {
  windows: { label: "Windows (.exe)", href: `${RELEASES_BASE}/omnis-run-win.exe`, icon: Monitor },
  mac:     { label: "macOS (Apple Silicon)", href: `${RELEASES_BASE}/omnis-run-mac`, icon: Apple },
  linux:   { label: "Linux (x64)", href: `${RELEASES_BASE}/omnis-run-linux`, icon: Terminal },
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
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-emerald-300 bg-emerald-100">
        <CheckCircle2 className="h-4 w-4 text-emerald-700" strokeWidth={2.5} />
      </div>
    );
  }
  if (step === current) {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded border-2 border-zinc-900 bg-zinc-900 text-white text-xs font-bold">
        {step}
      </div>
    );
  }
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded border-2 border-zinc-200 text-zinc-400 text-xs font-bold">
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
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-zinc-200 bg-white text-zinc-500 transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-800"
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
    <div className="flex items-center gap-2 rounded border border-zinc-200 bg-zinc-50 px-3 py-2.5">
      <code className="flex-1 overflow-x-auto whitespace-pre font-mono text-sm text-zinc-800 select-all">
        {code}
      </code>
      <CopyButton value={code} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Syntax-highlighted annotation snippet block
// Displays a multi-line code block with language label, no copy-button clutter
// (the CodeBlock component handles single-line copy; this one is read-only
// reference material).
// ─────────────────────────────────────────────────────────────────────────────

function AnnotationBlock({
  language,
  code,
}: {
  language: string;
  code: string;
}) {
  return (
    <div className="overflow-hidden rounded border border-zinc-200">
      {/* language label bar */}
      <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-100 px-3 py-1.5">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          {language}
        </span>
      </div>
      {/* code body */}
      <pre className="overflow-x-auto bg-zinc-50 px-4 py-3 text-xs leading-relaxed">
        <code className="font-mono text-zinc-800 whitespace-pre">
          {code}
        </code>
      </pre>
    </div>
  );
}

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

  // ── OS tab for the Step 3 command block ───────────────────────────────────
  const [osTab, setOsTab] = useState<"unix" | "windows">("unix");

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

  // OS-specific snippets. The CLI no longer accepts --req-id or --build flags;
  // those values are read directly from the annotated test output JSON.
  const unixSnippet = [
    `# 1. Set your API key (once per shell session)`,
    `export OMNIS_API_KEY=${keyForSnippet}`,
    ``,
    `# 2. Run the CLI`,
    `./omnis-run ./test-output.json`,
  ].join("\n");

  const windowsSnippet = [
    `# 1. Set your API key (once per PowerShell session)`,
    `$env:OMNIS_API_KEY="${keyForSnippet}"`,
    ``,
    `# 2. Run the CLI`,
    `.\\omnis-run-win.exe .\\test-output.json`,
  ].join("\n");

  const firstTestSnippet = osTab === "windows" ? windowsSnippet : unixSnippet;

  // Annotation snippets shown in Step 3 sub-step A
  const pytestAnnotationSnippet = `import pytest

@pytest.mark.req("21_CFR_820_30")
def test_database_encryption():
    # Your test logic here
    assert True`;

  const jestAnnotationSnippet = `// @req: IEC_62304_5_1
test('authenticates user session', () => {
  // Your test logic here
  expect(true).toBe(true);
});`;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <motion.div
        className="mb-8 text-center"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "tween", ease: "easeOut", duration: 0.35, delay: 0.05 }}
      >
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900">
          Connect the CLI
        </h2>
        <p className="mt-2 text-sm text-zinc-400">
          Three steps to send your first evidence log to the Omnis platform.
        </p>
      </motion.div>

      {initError && (
        <div className="mb-6 flex items-center gap-2 rounded border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {initError}
        </div>
      )}

      {/* ── Progress bar ────────────────────────────────────────────────── */}
      <motion.div
        className="mb-8 flex items-center gap-2"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "tween", ease: "easeOut", duration: 0.3, delay: 0.12 }}
      >
        <StepBadge step={1} current={activeStep} done={step1Done} />
        <div
          className={`h-px flex-1 transition-colors duration-500 ${
            step1Done ? "bg-emerald-400" : "bg-zinc-200"
          }`}
        />
        <StepBadge step={2} current={activeStep} done={step2Done} />
        <div
          className={`h-px flex-1 transition-colors duration-500 ${
            step2Done ? "bg-emerald-400" : "bg-zinc-200"
          }`}
        />
        <StepBadge step={3} current={activeStep} done={logDetected} />
      </motion.div>

      {/* ── Step 1: API Key ──────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "tween", ease: "easeOut", duration: 0.3, delay: 0.18 }}
      >
      <Card
        className={`mb-4 border transition-colors ${
          activeStep === 1
            ? "border-zinc-900 "
            : "border-zinc-200"
        }`}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded ${
                step1Done
                  ? "bg-emerald-100"
                  : "bg-zinc-100"
              }`}
            >
              <Key
                className={`h-4 w-4 ${
                  step1Done
                    ? "text-emerald-600"
                    : "text-zinc-500"
                }`}
                strokeWidth={1.75}
              />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold text-zinc-800">
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
            <div className="flex items-center justify-between gap-3 rounded border border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" strokeWidth={2} />
                <div>
                  <p className="text-sm font-medium text-zinc-800">
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
              <p className="text-xs text-zinc-500">
                You don&apos;t have an active API key yet. Generate one to get started.
                You can also manage keys from{" "}
                <Link
                  href="/dashboard/settings"
                  className="font-medium text-zinc-700 underline-offset-2 hover:underline"
                >
                  Settings
                </Link>
                .
              </p>
              <Button
                size="sm"
                onClick={openGenerateModal}
                className="bg-zinc-900 text-zinc-50 hover:bg-zinc-700"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" strokeWidth={2} />
                Generate API Key
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      </motion.div>

      {/* ── Step 2: Download CLI ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "tween", ease: "easeOut", duration: 0.3, delay: 0.26 }}
      >
      <Card
        className={`mb-4 border transition-colors ${
          activeStep === 2
            ? "border-zinc-900 "
            : "border-zinc-200"
        }`}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded ${
                step2Done
                  ? "bg-emerald-100"
                  : "bg-zinc-100"
              }`}
            >
              <Download
                className={`h-4 w-4 ${
                  step2Done
                    ? "text-emerald-600"
                    : "text-zinc-500"
                }`}
                strokeWidth={1.75}
              />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold text-zinc-800">
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
              ([key, { label, href, icon: Icon }]) => (
                <a
                  key={key}
                  href={href}
                  download
                  className="flex items-center gap-2 rounded border border-zinc-200 bg-white px-3 py-2.5 text-xs font-medium text-zinc-700  transition-colors hover:border-zinc-300 hover:bg-zinc-50"
                >
                  <Icon className="h-4 w-4 text-zinc-400 shrink-0" strokeWidth={1.5} />
                  <span className="flex-1 leading-tight">{label}</span>
                  <Download className="h-3.5 w-3.5 text-zinc-400" strokeWidth={1.75} />
                </a>
              )
            )}
          </div>

          {/* macOS chmod reminder */}
          <div className="rounded border border-amber-200 bg-amber-50/60 px-3 py-2.5">
            <p className="text-xs text-amber-800">
              <span className="font-semibold">macOS / Linux:</span> make the
              binary executable after download:
            </p>
            <CodeBlock code="chmod +x ./omnis-run-mac    # or omnis-run-linux" />
          </div>

          {step1Done && !step2Done && (
            <Button
              size="sm"
              onClick={handleStep2Continue}
              className="w-full sm:w-auto bg-zinc-900 text-zinc-50 hover:bg-zinc-700"
            >
              I&apos;ve downloaded it
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          )}

          {step2Done && (
            <div className="flex items-center gap-2 text-xs text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
              Binary downloaded — ready to run your first test.
            </div>
          )}
        </CardContent>
      </Card>
      </motion.div>

      {/* ── Step 3: Run first test ───────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "tween", ease: "easeOut", duration: 0.3, delay: 0.34 }}
      >
      <Card
        className={`mb-8 border transition-colors ${
          activeStep === 3
            ? "border-zinc-900 "
            : "border-zinc-200"
        }`}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded ${
                logDetected
                  ? "bg-emerald-100"
                  : "bg-zinc-100"
              }`}
            >
              <Terminal
                className={`h-4 w-4 ${
                  logDetected
                    ? "text-emerald-600"
                    : "text-zinc-500"
                }`}
                strokeWidth={1.75}
              />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold text-zinc-800">
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
          {/* ── Sub-step A: Tag your code ──────────────────────────────── */}
          <div className="rounded border border-zinc-200 bg-zinc-50 px-3.5 py-3">
            <p className="mb-2.5 text-xs font-semibold text-zinc-700">
              Step 3a — Tag your tests with requirement IDs
            </p>
            <p className="mb-3 text-xs text-zinc-500 leading-relaxed">
              Before running the CLI, annotate your tests so the framework injects
              regulatory requirement IDs directly into the output JSON. No flags
              needed on the command line.
            </p>
            <div className="space-y-2.5">
              <AnnotationBlock
                language="Python · PyTest"
                code={pytestAnnotationSnippet}
              />
              <AnnotationBlock
                language="JavaScript · Jest"
                code={jestAnnotationSnippet}
              />
            </div>
          </div>

          {/* ── Sub-step B: Run the CLI ───────────────────────────────── */}
          <div>
            <p className="mb-2 text-xs font-semibold text-zinc-700">
              Step 3b — Run the CLI
            </p>
            <p className="mb-3 text-xs text-zinc-500 leading-relaxed">
              Point the CLI at your test output file. Requirement IDs and build
              info are read from the JSON automatically.
            </p>

            {/* OS-specific command tabs */}
            <div>
              <div
                role="tablist"
                aria-label="Operating system"
                className="mb-2 inline-flex rounded border border-zinc-200 bg-zinc-50 p-0.5"
              >
                <button
                  role="tab"
                  aria-selected={osTab === "unix"}
                  onClick={() => setOsTab("unix")}
                  className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-all ${
                    osTab === "unix"
                      ? "bg-white text-zinc-900 "
                      : "text-zinc-500 hover:text-zinc-700"
                  }`}
                >
                  <Apple className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Mac / Linux
                </button>
                <button
                  role="tab"
                  aria-selected={osTab === "windows"}
                  onClick={() => setOsTab("windows")}
                  className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-all ${
                    osTab === "windows"
                      ? "bg-white text-zinc-900 "
                      : "text-zinc-500 hover:text-zinc-700"
                  }`}
                >
                  <Monitor className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Windows (PowerShell)
                </button>
              </div>

              <CodeBlock code={firstTestSnippet} />
              {revealedKey && (
                <p className="mt-1.5 text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  Your full key is shown above — copy it now. It won&apos;t be shown again after you leave this page.
                </p>
              )}
            </div>
          </div>

          {/* Polling status */}
          {!logDetected ? (
            <div className="flex items-center gap-2 rounded border border-zinc-200 bg-zinc-50 px-3 py-2.5">
              {isPolling ? (
                <>
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-zinc-400" />
                  <p className="text-xs text-zinc-500">
                    Waiting for your first evidence log… polling every 5 s
                  </p>
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 shrink-0 text-zinc-400" />
                  <p className="text-xs text-zinc-500">
                    Complete steps 1 &amp; 2, then run the snippet above.
                    Polling will start automatically.
                  </p>
                </>
              )}
            </div>
          ) : (
            /* ── Success state ─────────────────────────────────────────── */
            <div className="rounded border border-emerald-300 bg-emerald-50 px-4 py-4 text-center">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500" strokeWidth={1.75} />
              <p className="text-sm font-bold text-emerald-800">
                First evidence log received!
              </p>
              <p className="mt-1 text-xs text-emerald-700">
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
      </motion.div>

      {/* ── Skip link for users who already have logs ────────────────────── */}
      {!logDetected && (
        <p className="text-center text-xs text-zinc-400">
          Already have evidence logs?{" "}
          <Link
            href="/dashboard"
            className="font-medium text-zinc-600 underline-offset-2 hover:underline"
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
            className="absolute inset-0 bg-black/40"
            onClick={closeGenerateModal}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-md rounded border border-zinc-200 bg-white p-6 ">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-zinc-200 bg-zinc-50">
                <Key className="h-4 w-4 text-zinc-600" strokeWidth={1.75} />
              </div>
              <div>
                <h2
                  id="setup-generate-key-title"
                  className="text-base font-semibold text-zinc-900"
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
                className="text-xs font-medium text-zinc-700"
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
                className="h-9 text-sm"
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
              <div className="mt-3 flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
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
                className="text-zinc-600"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="bg-zinc-900 text-zinc-50 hover:bg-zinc-700 disabled:opacity-60"
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
          <div className="absolute inset-0 bg-black/50" aria-hidden="true" />
          <div className="relative z-10 w-full max-w-lg rounded border border-zinc-200 bg-white p-6 ">
            <div className="mb-5 flex items-start gap-3 rounded border border-amber-300 bg-amber-50 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" strokeWidth={2} />
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  Copy this key now — it will never be shown again
                </p>
                <p className="mt-0.5 text-xs text-amber-700">
                  The full key is not stored anywhere in Omnis. Once you close
                  this dialog you cannot retrieve it. If you lose it, revoke it
                  and generate a new one.
                </p>
              </div>
            </div>

            <h2
              id="setup-reveal-key-title"
              className="mb-3 text-base font-semibold text-zinc-900"
            >
              Your New API Key
            </h2>

            <div className="flex items-center gap-2 rounded border border-zinc-200 bg-zinc-50 p-3">
              <code className="flex-1 select-all overflow-x-auto whitespace-nowrap font-mono text-sm text-zinc-800">
                {revealedKey}
              </code>
              <CopyButton value={revealedKey} label="Copy API key" />
            </div>

            <div className="mt-5 flex justify-end">
              <Button
                size="sm"
                onClick={dismissRevealModal}
                className="bg-zinc-900 text-zinc-50 hover:bg-zinc-700"
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
