"use client";
// omnis-ui/app/dashboard/team/team-client.tsx
// Team Management client island — member table, invite form, remove actions,
// and Enterprise Code copy section.
//
// PERMISSION MODEL:
//   isAdmin=true  (admin) : full page — members table + Remove User buttons +
//                           Invite Teammate panel + Copy Enterprise Code section.
//   isAdmin=false (qa_manager / developer / viewer) : members table only.

import { useState, useTransition, useRef } from "react";
import {
  UserPlus,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Lock,
  Mail,
  Users,
  ShieldCheck,
  Code2,
  Eye,
  Trash2,
  Copy,
  Check,
  Crown,
  KeyRound,
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
import { Separator } from "@/components/ui/separator";
import {
  inviteTeamMember,
  removeTeamMember,
  type TeamMember,
  type InviteRole,
} from "@/app/actions/team";

// ---------------------------------------------------------------------------
// Role badge config
// ---------------------------------------------------------------------------

const ROLE_CONFIG: Record<
  NonNullable<InviteRole>,
  { label: string; className: string }
> = {
  admin: {
    label: "Admin",
    className:
      "bg-violet-100 text-violet-800 border border-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-700/40",
  },
  qa_manager: {
    label: "QA Manager",
    className:
      "bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700/40",
  },
  developer: {
    label: "Developer",
    className:
      "bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700/40",
  },
  viewer: {
    label: "Viewer",
    className:
      "bg-zinc-100 text-zinc-600 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
  },
};

function RoleChip({ role }: { role: InviteRole | null }) {
  if (!role) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-zinc-100 text-zinc-400 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-500 dark:border-zinc-700">
        Pending
      </span>
    );
  }
  const { label, className } = ROLE_CONFIG[role];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TeamClientProps {
  initialMembers: TeamMember[];
  membersError?: string;
  isAdmin: boolean;
  currentUserId: string;
  orgId: string;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TeamClient({
  initialMembers,
  membersError,
  isAdmin,
  currentUserId,
  orgId,
}: TeamClientProps) {
  const [members, setMembers] = useState<TeamMember[]>(initialMembers);

  // Invite form state
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("developer");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [isInviting, startInviting] = useTransition();

  // Remove state — keyed by user_id so each row has its own pending indicator
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Enterprise code copy state
  const [copied, setCopied] = useState(false);

  const emailInputRef = useRef<HTMLInputElement>(null);

  // ── Handlers ────────────────────────────────────────────────────────────

  function validateEmail(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) { setEmailError("Email address is required."); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError("Please enter a valid email address."); return false;
    }
    setEmailError(null);
    return true;
  }

  function handleInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInviteError(null);
    setInviteSuccess(null);
    if (!validateEmail(email)) return;

    const fd = new FormData();
    fd.set("email", email.trim().toLowerCase());
    fd.set("role", role);

    startInviting(async () => {
      const result = await inviteTeamMember(fd);
      if (!result.success) {
        setInviteError(result.error ?? "Invite failed. Please try again.");
        return;
      }
      const pendingMember: TeamMember = {
        user_id: `pending-${Date.now()}`,
        developer_email: email.trim().toLowerCase(),
        role,
        joined_at: new Date().toISOString(),
      };
      setMembers((prev) => {
        const exists = prev.some((m) => m.developer_email === pendingMember.developer_email);
        return exists ? prev : [pendingMember, ...prev];
      });
      setInviteSuccess(`Invite sent to ${email.trim().toLowerCase()}. They'll receive an email shortly.`);
      setEmail("");
      setRole("developer");
      emailInputRef.current?.focus();
    });
  }

  async function handleRemove(targetUserId: string, targetEmail: string) {
    if (!confirm(`Remove ${targetEmail} from the organization?`)) return;
    setRemoveError(null);
    setRemovingId(targetUserId);
    try {
      const result = await removeTeamMember(targetUserId);
      if (!result.success) {
        setRemoveError(result.error ?? "Failed to remove user. Please try again.");
      } else {
        setMembers((prev) => prev.filter((m) => m.user_id !== targetUserId));
      }
    } finally {
      setRemovingId(null);
    }
  }

  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(orgId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback: select the input text for manual copy
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">

      {/* ── Enterprise Code section — admin only ────────────────────────── */}
      {isAdmin && (
        <section aria-labelledby="enterprise-code-heading" className="space-y-4">
          <div>
            <h3
              id="enterprise-code-heading"
              className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-400"
            >
              <KeyRound className="h-3.5 w-3.5" strokeWidth={1.75} />
              Enterprise Code
            </h3>
            <p className="mt-1.5 text-xs text-zinc-400">
              Share this code with new hires so they can join your organization during onboarding.
            </p>
          </div>

          <Card className="border-zinc-200 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                <Crown className="h-4 w-4 text-violet-500" strokeWidth={1.75} />
                Copy Enterprise Code
              </CardTitle>
              <CardDescription className="text-xs text-zinc-400">
                This is your organization&apos;s unique identifier. Only share it with authorized personnel.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-700 select-all dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 overflow-x-auto">
                  {orgId}
                </code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCopyCode}
                  className="shrink-0 gap-1.5 border-zinc-200 dark:border-zinc-700"
                  aria-label="Copy enterprise code to clipboard"
                >
                  {copied ? (
                    <><Check className="h-3.5 w-3.5 text-emerald-500" /> Copied</>
                  ) : (
                    <><Copy className="h-3.5 w-3.5" /> Copy</>
                  )}
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-zinc-400">
                New team members paste this code in the &quot;Join Existing&quot; tab during onboarding.
              </p>
            </CardContent>
          </Card>
        </section>
      )}

      {isAdmin && <Separator className="bg-zinc-200 dark:bg-zinc-800" />}

      {/* ── Current Members section ──────────────────────────────────────── */}
      <section aria-labelledby="members-heading" className="space-y-4">
        <div>
          <h3
            id="members-heading"
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-400"
          >
            <Users className="h-3.5 w-3.5" strokeWidth={1.75} />
            Current Members
          </h3>
          <p className="mt-1.5 text-xs text-zinc-400">
            All users with access to your organization.
          </p>
        </div>

        <Card className="border-zinc-200 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <CardContent className="pt-4">
            {membersError && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400 mb-4">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{membersError}
              </div>
            )}
            {removeError && (
              <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400 mb-4">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{removeError}
              </div>
            )}

            {members.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-200 bg-zinc-50/60 py-10 text-center dark:border-zinc-700 dark:bg-zinc-800/30">
                <Users className="h-6 w-6 text-zinc-300 dark:text-zinc-600" strokeWidth={1.5} />
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">No members found</p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">Invite your first teammate below.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
                <table className="w-full text-sm" aria-label="Team members">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/60">
                      <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">Email</th>
                      <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">Role</th>
                      <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">Join Date</th>
                      {isAdmin && (
                        <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">
                          <span className="sr-only">Actions</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {members.map((member) => (
                      <tr key={member.user_id} className="transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                              <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase">
                                {member.developer_email.charAt(0)}
                              </span>
                            </div>
                            <span className="font-medium text-zinc-800 dark:text-zinc-200 text-sm">
                              {member.developer_email}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3"><RoleChip role={member.role} /></td>
                        <td className="px-4 py-3 text-xs text-zinc-400">
                          {member.joined_at && member.joined_at !== new Date(0).toISOString()
                            ? new Date(member.joined_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" })
                            : "—"}
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3 text-right">
                            {/* Hide remove button for the current user (self-removal blocked server-side too) */}
                            {member.user_id !== currentUserId && !member.user_id.startsWith("pending-") && (
                              <button
                                type="button"
                                onClick={() => handleRemove(member.user_id, member.developer_email)}
                                disabled={removingId === member.user_id}
                                aria-label={`Remove ${member.developer_email} from organization`}
                                className="inline-flex items-center justify-center rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                                title={`Remove ${member.developer_email}`}
                              >
                                {removingId === member.user_id
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                                }
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <Separator className="bg-zinc-200 dark:bg-zinc-800" />

      {/* ── Invite Teammate section ──────────────────────────────────────── */}
      <section aria-labelledby="invite-heading" className="space-y-4">
        <div>
          <h3 id="invite-heading" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">
            <UserPlus className="h-3.5 w-3.5" strokeWidth={1.75} />
            Invite Teammate
          </h3>
          <p className="mt-1.5 text-xs text-zinc-400">
            {isAdmin
              ? "Send a sign-up invite link and assign an RBAC role in one step."
              : "Only Admins can invite new team members."}
          </p>
        </div>

        {!isAdmin ? (
          <Card className="border-zinc-200 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <CardContent className="py-8">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <Lock className="h-5 w-5 text-zinc-400 dark:text-zinc-500" />
                </div>
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Permission Required</p>
                <p className="max-w-xs text-xs text-zinc-400 dark:text-zinc-500">
                  Inviting team members is restricted to Admins. Contact your organization Admin to add new users.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-zinc-200 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                <UserPlus className="h-4 w-4 text-zinc-500" strokeWidth={1.75} />
                Invite a New Member
              </CardTitle>
              <CardDescription className="text-xs text-zinc-400">
                An invite link will be sent to the email address below. The recipient must click the link to create their account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleInvite} noValidate className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="invite-email" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                    <Input
                      id="invite-email"
                      ref={emailInputRef}
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(null); if (inviteError) setInviteError(null); if (inviteSuccess) setInviteSuccess(null); }}
                      placeholder="colleague@company.com"
                      autoComplete="email"
                      className="h-9 pl-9 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                      aria-describedby={emailError ? "invite-email-error" : undefined}
                      aria-invalid={!!emailError}
                      disabled={isInviting}
                    />
                  </div>
                  {emailError && <p id="invite-email-error" role="alert" className="text-[11px] text-red-500">{emailError}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="invite-role" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Assign Role</Label>
                  <select
                    id="invite-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value as InviteRole)}
                    disabled={isInviting}
                    className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-0 text-sm text-zinc-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:focus:ring-zinc-100/20 dark:focus:border-zinc-500"
                    aria-label="Select role for the new member"
                  >
                    <option value="admin">Admin — Full access, manage team</option>
                    <option value="qa_manager">QA Manager — View and approve compliance logs</option>
                    <option value="developer">Developer — Ingest logs, view metrics</option>
                    <option value="viewer">Viewer — Read-only dashboard access</option>
                  </select>
                  <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-4">
                    <RoleDescriptionTile active={role === "admin"} icon={<Crown className="h-3 w-3" />} label="Admin" desc="Manage team + all QA access" colorClass="violet" />
                    <RoleDescriptionTile active={role === "qa_manager"} icon={<ShieldCheck className="h-3 w-3" />} label="QA Manager" desc="Approve & lock logs" colorClass="emerald" />
                    <RoleDescriptionTile active={role === "developer"} icon={<Code2 className="h-3 w-3" />} label="Developer" desc="Ingest via CLI" colorClass="blue" />
                    <RoleDescriptionTile active={role === "viewer"} icon={<Eye className="h-3 w-3" />} label="Viewer" desc="Read-only access" colorClass="zinc" />
                  </div>
                </div>

                {inviteSuccess && (
                  <div role="status" aria-live="polite" className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800 dark:border-emerald-700/40 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />{inviteSuccess}
                  </div>
                )}
                {inviteError && (
                  <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{inviteError}
                  </div>
                )}

                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={isInviting} className="bg-zinc-900 text-zinc-50 hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
                    {isInviting ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Sending Invite…</> : <><UserPlus className="mr-1.5 h-3.5 w-3.5" strokeWidth={2} />Send Invite</>}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Role description tile (purely visual, inside invite form)
// ---------------------------------------------------------------------------

interface RoleDescriptionTileProps {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  desc: string;
  colorClass: "violet" | "emerald" | "blue" | "zinc";
}

function RoleDescriptionTile({ active, icon, label, desc, colorClass }: RoleDescriptionTileProps) {
  const activeBg = {
    violet: "border-violet-300 bg-violet-50 dark:border-violet-700/60 dark:bg-violet-950/40",
    emerald: "border-emerald-300 bg-emerald-50 dark:border-emerald-700/60 dark:bg-emerald-950/40",
    blue: "border-blue-300 bg-blue-50 dark:border-blue-700/60 dark:bg-blue-950/40",
    zinc: "border-zinc-300 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/60",
  }[colorClass];

  const inactiveBg = "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800/20";

  const activeText = {
    violet: "text-violet-800 dark:text-violet-300",
    emerald: "text-emerald-800 dark:text-emerald-300",
    blue: "text-blue-800 dark:text-blue-300",
    zinc: "text-zinc-700 dark:text-zinc-300",
  }[colorClass];

  return (
    <div aria-hidden="true" className={`rounded-lg border p-2.5 transition-all ${active ? activeBg : inactiveBg}`}>
      <div className={`flex items-center gap-1.5 mb-1 ${active ? activeText : "text-zinc-400"}`}>
        {icon}
        <span className="text-[11px] font-semibold">{label}</span>
      </div>
      <p className="text-[10px] leading-tight text-zinc-400 dark:text-zinc-500">{desc}</p>
    </div>
  );
}
