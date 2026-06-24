// omnis-ui/app/auth/success/page.tsx
// Email Confirmation Success — static terminal page.
//
// The Supabase email-confirmation flow (/auth/callback) routes the user here
// AFTER the one-time code has been exchanged for a session. We intentionally
// do NOT redirect the user into the app from this page:
//   - The confirmation link is frequently opened in a different browser/tab
//     than the one the user signed up in, which causes cross-tab session
//     desync and confusing "logged into the wrong place" states.
//   - On Vercel preview deployments the callback origin can differ from the
//     user's original window origin, producing preview-URL session conflicts.
//
// Instead, this is a static, self-contained dead-end: the user is told their
// email is confirmed and asked to return to their original window. No session
// is required to render it, so it works regardless of which tab opens the link.

import { ShieldCheck, CheckCircle2 } from "lucide-react";

export default function AuthSuccessPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-md text-center">
        {/* Brand mark */}
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30">
            <ShieldCheck className="h-5 w-5 text-emerald-500" strokeWidth={1.75} />
          </div>
          <div className="text-left leading-none">
            <span className="block text-sm font-bold text-slate-900">
              QAVRO
            </span>
            <span className="block text-[10px] font-semibold uppercase tracking-widest text-emerald-600">
              FDA Assurance Platform
            </span>
          </div>
        </div>

        {/* Success mark */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 ring-1 ring-emerald-200">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" strokeWidth={1.75} />
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Your email is now confirmed.
        </h1>
        <p className="mt-3 text-base leading-relaxed text-slate-500">
          You can close this tab and return to your original window.
        </p>
      </div>
    </div>
  );
}
