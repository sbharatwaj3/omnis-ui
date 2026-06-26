// omnis-ui/app/dashboard/integration/page.tsx
// CLI Setup & Integration Guide — Step-by-step onboarding for connecting
// an external CI/CD pipeline to the Omnis RegOps platform.
//
// React Server Component shell. The copy-to-clipboard terminal block is a
// lightweight client island (TerminalBlock) to avoid making the entire page
// a client component.

import Link from "next/link";
import {
  ShieldCheck,
  Download,
  KeyRound,
  Terminal,
  Monitor,
  Apple,
  Server,
} from "lucide-react";
import { DashboardHeader } from "@/components/dashboard-header";
import { Separator } from "@/components/ui/separator";
import { TerminalBlock } from "@/components/terminal-block";

// ---------------------------------------------------------------------------
// Download platform cards
// ---------------------------------------------------------------------------

interface Platform {
  label: string;
  os: string;
  icon: React.ReactNode;
  filename: string;
  href: string;
  badge?: string;
}

const PLATFORMS: Platform[] = [
  {
    label: "Windows",
    os: "Windows 10 / 11 · x64",
    icon: <Monitor className="h-5 w-5" strokeWidth={1.5} />,
    filename: "omnis-run-windows-amd64.exe",
    href: "#",
    badge: ".exe",
  },
  {
    label: "macOS",
    os: "macOS 12+ · Apple Silicon & Intel",
    icon: <Apple className="h-5 w-5" strokeWidth={1.5} />,
    filename: "omnis-run-darwin-universal",
    href: "#",
  },
  {
    label: "Linux",
    os: "Ubuntu 20.04+ / Debian · x64",
    icon: <Server className="h-5 w-5" strokeWidth={1.5} />,
    filename: "omnis-run-linux-amd64",
    href: "#",
  },
];

// ---------------------------------------------------------------------------
// Step number badge
// ---------------------------------------------------------------------------

function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white">
      {n}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function IntegrationPage() {
  return (
    <div className="min-h-screen bg-zinc-50">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <DashboardHeader subtitle="CLI Integration" showRoleBadge={false} />

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-7xl w-full px-6 py-8 md:px-8 md:py-12">
        {/* Page title */}
        <div className="mb-8 flex items-center gap-3">
          <Terminal className="h-5 w-5 text-zinc-500" strokeWidth={1.75} />
          <div>
            <h2 className="text-xl font-bold tracking-tight text-zinc-900">
              CLI Integration Setup
            </h2>
            <p className="mt-0.5 text-sm text-zinc-400">
              Connect your CI/CD pipeline to Omnis in three steps.
            </p>
          </div>
        </div>

        <Separator className="mb-10 bg-zinc-200" />

        {/* ── Step 1: Download ─────────────────────────────────────────── */}
        <section aria-labelledby="step1-heading" className="mb-10">
          <div className="mb-5 flex items-center gap-3">
            <StepBadge n={1} />
            <div>
              <h3
                id="step1-heading"
                className="flex items-center gap-2 text-base font-semibold text-zinc-900"
              >
                <Download className="h-4 w-4 text-zinc-500" strokeWidth={1.75} />
                Download the CLI Tool
              </h3>
              <p className="mt-0.5 text-xs text-zinc-400">
                Choose the binary for your operating system. No installation
                required — place the binary in your PATH or call it directly.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {PLATFORMS.map((p) => (
              <a
                key={p.label}
                href={p.href}
                aria-label={`Download Omnis CLI for ${p.label}`}
                className="group flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-all hover:border-zinc-300 hover:shadow-md"
              >
                {/* Icon + badge */}
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-600 group-hover:border-zinc-300 group-hover:text-zinc-900">
                    {p.icon}
                  </div>
                  {p.badge && (
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
                      {p.badge}
                    </span>
                  )}
                </div>

                {/* Label */}
                <div>
                  <p className="text-sm font-semibold text-zinc-800">
                    {p.label}
                  </p>
                  <p className="text-[11px] text-zinc-400">{p.os}</p>
                </div>

                {/* Filename */}
                <code className="mt-auto truncate rounded bg-zinc-50 px-2 py-1 font-mono text-[10px] text-zinc-500">
                  {p.filename}
                </code>

                {/* CTA */}
                <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 group-hover:text-zinc-900">
                  <Download className="h-3 w-3" strokeWidth={2} />
                  Download
                </div>
              </a>
            ))}
          </div>

          {/* Checksum note */}
          <p className="mt-3 text-[11px] text-zinc-400">
            SHA-256 checksums will be published alongside each release for
            binary integrity verification.
          </p>
        </section>

        <Separator className="mb-10 bg-zinc-200" />

        {/* ── Step 2: Authenticate ─────────────────────────────────────── */}
        <section aria-labelledby="step2-heading" className="mb-10">
          <div className="mb-5 flex items-center gap-3">
            <StepBadge n={2} />
            <div>
              <h3
                id="step2-heading"
                className="flex items-center gap-2 text-base font-semibold text-zinc-900"
              >
                <KeyRound className="h-4 w-4 text-zinc-500" strokeWidth={1.75} />
                Authenticate with Your API Key
              </h3>
              <p className="mt-0.5 text-xs text-zinc-400">
                The CLI reads your Omnis API Key from an environment variable.
                Set it once in your CI/CD provider&apos;s secret store.
              </p>
            </div>
          </div>

          {/* Instruction card */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="mb-3 text-sm font-medium text-zinc-700">
              Export your API key as an environment variable:
            </p>

            {/* env var blocks */}
            <div className="space-y-2">
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Linux / macOS (shell)
                </p>
                <TerminalBlock
                  code={`export OMNIS_API_KEY="omn_your_key_here"`}
                  lang="shell"
                />
              </div>
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Windows (PowerShell)
                </p>
                <TerminalBlock
                  code={`$env:OMNIS_API_KEY = "omn_your_key_here"`}
                  lang="powershell"
                />
              </div>
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  GitHub Actions (secrets.yml)
                </p>
                <TerminalBlock
                  code={`env:\n  OMNIS_API_KEY: \${{ secrets.OMNIS_API_KEY }}`}
                  lang="yaml"
                />
              </div>
            </div>

            {/* Key generation CTA */}
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3">
              <KeyRound
                className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400"
                strokeWidth={1.75}
              />
              <p className="text-xs text-zinc-500">
                Don&apos;t have an API key yet?{" "}
                <Link
                  href="/dashboard/settings"
                  className="font-semibold text-zinc-800 underline underline-offset-2 hover:text-zinc-600"
                >
                  Generate one in Settings →
                </Link>
              </p>
            </div>
          </div>
        </section>

        <Separator className="mb-10 bg-zinc-200" />

        {/* ── Step 3: Execute ──────────────────────────────────────────── */}
        <section aria-labelledby="step3-heading" className="mb-10">
          <div className="mb-5 flex items-center gap-3">
            <StepBadge n={3} />
            <div>
              <h3
                id="step3-heading"
                className="flex items-center gap-2 text-base font-semibold text-zinc-900"
              >
                <Terminal className="h-4 w-4 text-zinc-500" strokeWidth={1.75} />
                Run the CLI &amp; Ingest Evidence
              </h3>
              <p className="mt-0.5 text-xs text-zinc-400">
                After your test suite completes, pass the JSON results file
                to <code className="font-mono">omnis-run</code>. It signs, hashes, and
                ships the evidence log to Omnis automatically — no flags required.
              </p>
            </div>
          </div>

          {/* Primary command */}
          <div className="mb-4">
            <p className="mb-2 text-xs font-medium text-zinc-500">
              Basic usage (Linux / macOS)
            </p>
            <TerminalBlock
              code="omnis-run ./test-output.json"
              lang="shell"
              prominent
            />
          </div>

          {/* Windows variant */}
          <div>
            <p className="mb-2 text-xs font-medium text-zinc-500">
              Windows (PowerShell / CMD)
            </p>
            <TerminalBlock
              code="omnis-run.exe .\test-output.json"
              lang="powershell"
            />
          </div>
        </section>

        {/* ── Done CTA ────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <ShieldCheck
              className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600"
              strokeWidth={1.75}
            />
            <div>
              <p className="text-sm font-semibold text-emerald-800">
                Integration complete
              </p>
              <p className="mt-0.5 text-xs text-emerald-700">
                Once your first run arrives, it will appear in the Evidence
                Dashboard within seconds. Each log is HMAC-signed, hashed, and
                linked to its regulatory requirement automatically.
              </p>
              <Link
                href="/dashboard"
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-600"
              >
                View Evidence Dashboard →
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
