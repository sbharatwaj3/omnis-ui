"use client";
// omnis-ui/app/onboarding/page.tsx
// Omnis RegOps — Organization Onboarding
//
// Presented to every user whose public.users.org_id is NULL (pending state).
// The middleware gate in proxy.ts enforces this route — no authenticated user
// with a resolved org_id can land here (they are redirected to /dashboard).
//
// Two flows:
//   1. Create New Organization — input a company name → creates an org row
//      and assigns it to the current user.
//   2. Join Existing Organization — input an Enterprise Code (org_id UUID)
//      → verifies the org exists and assigns it to the current user.
//
// On success both flows server-redirect to /dashboard.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Building2,
  Users,
  ArrowRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createOrganization, joinOrganization } from "./actions";
import { createClient } from "@/utils/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActiveTab = "create" | "join";

// ---------------------------------------------------------------------------
// Left branding panel
// ---------------------------------------------------------------------------

function BrandPanel() {
  return (
    <div className="hidden lg:flex lg:w-[48%] xl:w-[45%] flex-col justify-between bg-slate-900 px-12 py-12 dark:bg-slate-950">
      <Link href="/" className="flex items-center gap-3 group">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30 group-hover:ring-emerald-400 transition-all duration-200">
          <ShieldCheck className="h-5 w-5 text-emerald-400" strokeWidth={1.75} />
        </div>
        <div className="leading-none">
          <span className="block text-sm font-bold text-slate-100">
            Omnis MedTech Corp
          </span>
          <span className="block text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
            RegOps Platform
          </span>
        </div>
      </Link>

      <div className="max-w-sm">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-800 bg-emerald-950/60 px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-semibold text-emerald-300">
            Organization Setup — Step 1 of 1
          </span>
        </div>

        <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-white xl:text-4xl">
          Connect Your
          <br />
          <span className="text-emerald-400">Compliance Workspace.</span>
        </h1>

        <p className="mt-4 text-sm leading-relaxed text-slate-400">
          Every evidence log, build record, and regulatory artefact is isolated
          to your organization. Set up your workspace to start capturing
          cryptographically signed compliance data.
        </p>

        <div className="mt-10 space-y-5">
          <FeaturePoint
            icon={Building2}
            title="Multi-Tenant Isolation"
            body="Your data is partitioned at the database layer via Row Level Security. No other organization can ever access your records."
          />
          <FeaturePoint
            icon={ShieldCheck}
            title="21 CFR Part 11 Audit Trail"
            body="Organization creation is itself a signed event appended to the immutable evidence ledger."
          />
          <FeaturePoint
            icon={Users}
            title="Team Collaboration"
            body="Share an Enterprise Code with your team. All members inherit the same RLS scope and compliance context."
          />
        </div>
      </div>

      <p className="text-xs text-slate-600">
        © 2026 Omnis MedTech Corp. Access restricted to authorized personnel only.
      </p>
    </div>
  );
}

function FeaturePoint({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ElementType;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 ring-1 ring-slate-700">
        <Icon className="h-3.5 w-3.5 text-emerald-400" strokeWidth={1.75} />
      </div>
      <div>
        <p className="text-xs font-bold text-slate-200">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{body}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab button
// ---------------------------------------------------------------------------

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex flex-1 flex-col items-start gap-1.5 rounded-xl border p-4 text-left
        transition-all duration-150
        ${
          active
            ? "border-slate-900 bg-slate-900 text-white shadow-sm dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800"
        }
      `}
    >
      <div className="flex items-center gap-2">
        <Icon
          className={`h-4 w-4 ${active ? "text-emerald-400" : "text-slate-400"}`}
          strokeWidth={1.75}
        />
        <span className="text-sm font-bold">{label}</span>
      </div>
      <p
        className={`text-xs leading-relaxed ${
          active ? "text-slate-300 dark:text-slate-600" : "text-slate-400"
        }`}
      >
        {description}
      </p>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Error banner
// ---------------------------------------------------------------------------

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 dark:border-red-900/60 dark:bg-red-950/40">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500 dark:text-red-400" />
      <p className="text-xs leading-relaxed text-red-700 dark:text-red-300">
        {message}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Role selector — used in both forms
// ---------------------------------------------------------------------------

const ROLE_OPTIONS = [
  {
    value: "qa_manager",
    label: "QA Manager",
    description: "Can view and approve compliance logs on the dashboard.",
  },
  {
    value: "developer",
    label: "Developer",
    description: "Can ingest logs via CLI and view metrics.",
  },
  {
    value: "viewer",
    label: "Viewer",
    description: "Read-only access to the compliance dashboard.",
  },
] as const;

function RoleSelector({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = ROLE_OPTIONS.find((r) => r.value === value);

  return (
    <div className="space-y-1.5">
      <Label
        htmlFor="role"
        className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
      >
        Your Role <span className="text-red-400">*</span>
      </Label>

      <div className="relative">
        <button
          type="button"
          id="role"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex h-11 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <span className={selected ? "text-slate-900 dark:text-slate-100" : "text-slate-400"}>
            {selected ? selected.label : "Select a role…"}
          </span>
          <ChevronDown className="h-4 w-4 text-slate-400" strokeWidth={1.75} />
        </button>

        {open && (
          <ul
            role="listbox"
            aria-label="Role selection"
            className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
          >
            {ROLE_OPTIONS.map((opt) => (
              <li
                key={opt.value}
                role="option"
                aria-selected={value === opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`cursor-pointer px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 ${
                  value === opt.value ? "bg-emerald-50 dark:bg-emerald-950/30" : ""
                }`}
              >
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {opt.label}
                  {value === opt.value && (
                    <span className="ml-2 text-xs font-normal text-emerald-500">✓ selected</span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">{opt.description}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <p className="text-[11px] text-slate-400">{selected.description}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Organization form
// ---------------------------------------------------------------------------

function CreateOrgForm() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createOrganization(formData);
      if (!result.success && result.error) {
        setError(result.error);
      }
      // On success, createOrganization calls redirect("/dashboard") server-side
      // which throws a NEXT_REDIRECT — the transition handles the navigation.
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label
          htmlFor="company_name"
          className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
        >
          Company Name
        </Label>
        <Input
          id="company_name"
          name="company_name"
          type="text"
          autoComplete="organization"
          required
          placeholder="e.g. Acme MedTech Inc."
          disabled={isPending}
          className="h-11 border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-600"
        />
        <p className="text-[11px] text-slate-400">
          This name appears on all generated compliance reports and eSTAR
          submissions.
        </p>
      </div>

      {/* Role notice for org creators */}
      <div className="flex items-start gap-2.5 rounded-lg border border-violet-200 bg-violet-50 px-3.5 py-3 dark:border-violet-800/60 dark:bg-violet-950/40">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" />
        <div>
          <p className="text-xs font-semibold text-violet-800 dark:text-violet-300">
            You will be assigned the Admin role
          </p>
          <p className="mt-0.5 text-xs text-violet-700 dark:text-violet-400">
            As the workspace creator, you will have full Admin access — manage
            team members, approve compliance logs, and control all settings.
          </p>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      <Button
        type="submit"
        disabled={isPending}
        className="h-11 w-full rounded-xl bg-slate-900 text-sm font-bold text-white shadow-sm transition-all hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
      >
        {isPending ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Creating workspace…
          </span>
        ) : (
          <span className="flex items-center gap-2">
            Create Organization
            <ArrowRight className="h-4 w-4" />
          </span>
        )}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Join Organization form
// ---------------------------------------------------------------------------

function JoinOrgForm() {
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    // Inject the controlled role value (not reliably submitted from custom dropdown)
    formData.set("role", role);
    startTransition(async () => {
      const result = await joinOrganization(formData);
      if (!result.success && result.error) {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label
          htmlFor="enterprise_code"
          className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
        >
          Enterprise Code
        </Label>
        <Input
          id="enterprise_code"
          name="enterprise_code"
          type="text"
          autoComplete="off"
          spellCheck={false}
          required
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          disabled={isPending}
          className="h-11 font-mono text-sm border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-600"
        />
        <p className="text-[11px] text-slate-400">
          Ask your organization administrator for the Enterprise Code. It is a
          UUID in the format shown above.
        </p>
      </div>

      <RoleSelector value={role} onChange={setRole} disabled={isPending} />

      {error && <ErrorBanner message={error} />}

      <Button
        type="submit"
        disabled={isPending || !role}
        className="h-11 w-full rounded-xl bg-slate-900 text-sm font-bold text-white shadow-sm transition-all hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
      >
        {isPending ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Joining workspace…
          </span>
        ) : (
          <span className="flex items-center gap-2">
            Join Organization
            <ArrowRight className="h-4 w-4" />
          </span>
        )}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Right panel — onboarding card
// ---------------------------------------------------------------------------

function OnboardingCard() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("create");
  const [isSigningOut, setIsSigningOut] = useState(false);
  const router = useRouter();

  async function handleSignOut() {
    setIsSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="flex w-full flex-col items-center justify-center px-6 py-12 lg:w-[52%] xl:w-[55%] bg-white dark:bg-slate-950">
      {/* Mobile logo */}
      <Link
        href="/"
        className="mb-8 flex flex-col items-center gap-3 lg:hidden group"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 shadow-lg group-hover:ring-2 group-hover:ring-emerald-400 transition-all dark:bg-slate-800">
          <ShieldCheck
            className="h-6 w-6 text-emerald-400"
            strokeWidth={1.75}
          />
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Omnis MedTech Corp
          </p>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
            RegOps Platform
          </p>
        </div>
      </Link>

      <div className="w-full max-w-md">
        {/* Progress indicator */}
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500">
            <CheckCircle2 className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
          </div>
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white text-xs font-bold dark:bg-slate-100 dark:text-slate-900">
            2
          </div>
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          <div className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 text-slate-400 text-xs font-bold dark:border-slate-700">
            3
          </div>
        </div>

        {/* Header */}
        <div className="mb-7">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Set up your workspace
          </h2>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            Create a new organization or join an existing one to activate your
            compliance dashboard.
          </p>
        </div>

        {/* Compliance pill */}
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-900">
          <ShieldCheck
            className="h-3.5 w-3.5 shrink-0 text-emerald-500"
            strokeWidth={2}
          />
          <p className="text-xs text-slate-600 dark:text-slate-400">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Multi-tenant isolation active.
            </span>{" "}
            Your data is partitioned by organization at the database layer.
          </p>
        </div>

        {/* Tab selector */}
        <div className="mb-6 flex gap-3">
          <TabButton
            active={activeTab === "create"}
            onClick={() => setActiveTab("create")}
            icon={Building2}
            label="Create New"
            description="Start a fresh compliance workspace for your company."
          />
          <TabButton
            active={activeTab === "join"}
            onClick={() => setActiveTab("join")}
            icon={Users}
            label="Join Existing"
            description="Use an Enterprise Code to join your team's workspace."
          />
        </div>

        {/* Active form */}
        {activeTab === "create" ? <CreateOrgForm /> : <JoinOrgForm />}

        {/* Sign out link */}
        <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-600">
          Wrong account?{" "}
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="inline-flex items-center gap-1 font-semibold text-slate-600 underline-offset-2 hover:underline disabled:opacity-50 dark:text-slate-400"
          >
            {isSigningOut ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Signing out…
              </>
            ) : (
              <>
                <ChevronLeft className="h-3 w-3" />
                Back to sign in
              </>
            )}
          </button>
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page export
// ---------------------------------------------------------------------------

export default function OnboardingPage() {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <BrandPanel />
      <OnboardingCard />
    </div>
  );
}
