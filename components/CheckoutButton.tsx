"use client";
// omnis-ui/components/CheckoutButton.tsx
// Client Component — Stripe Checkout initiator button.
//
// Responsibilities:
//   1. Accept an optional priceId (for multi-tier pricing).
//   2. Invoke the `createCheckoutSession` server action on click.
//   3. Manage a loading/redirecting state with a spinner.
//   4. Hard-redirect to the Stripe-hosted checkout URL.
//   5. Surface any errors inline without crashing the page.
//
// SECURITY (LOW-01 fix): orgId is NO LONGER accepted as a prop and is NOT
// passed to the server action. The server action re-derives org_id from the
// verified JWT session internally. Passing orgId from the client would allow
// a malicious actor to craft a checkout session for a foreign org_id and
// trigger a Stripe webhook that updates another org's subscription_status.
// The prop is kept as an optional no-op for backwards compatibility at
// existing call-sites while the parent components are migrated.

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createCheckoutSession } from "@/app/actions/stripe";

interface CheckoutButtonProps {
  /**
   * @deprecated orgId is no longer forwarded to the server action.
   * The action self-derives org_id from the verified session JWT.
   * This prop is accepted but ignored to avoid breaking existing call-sites.
   */
  orgId?: string;
  /** Optional Stripe Price ID override — allows multi-tier checkout buttons. */
  priceId?: string;
  /** Button label. Defaults to "Get Started". */
  label?: string;
  /** Tailwind class overrides for the button wrapper. */
  className?: string;
}

export function CheckoutButton({
  // orgId intentionally destructured but not used — see deprecation notice above.
  orgId: _orgId,
  priceId,
  label = "Get Started",
  className,
}: CheckoutButtonProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleClick() {
    setStatus("loading");
    setErrorMessage(null);

    try {
      // orgId is derived from the verified session inside the server action.
      const url = await createCheckoutSession(priceId);

      if (!url) {
        throw new Error("Checkout session returned no URL. Please try again.");
      }

      // Hard redirect — leave the SPA so Stripe can take over the tab.
      window.location.href = url;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setErrorMessage(message);
      setStatus("error");
    }
  }

  const isLoading = status === "loading";

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={handleClick}
        disabled={isLoading}
        aria-disabled={isLoading}
        className={
          className ??
          "inline-flex w-full items-center justify-center gap-2.5 rounded bg-slate-900 px-6 py-3.5 text-sm font-bold text-white shadow-slate-900/20 transition-all hover:bg-slate-800 hover:shadow-slate-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        }
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>Redirecting to Stripe…</span>
          </>
        ) : (
          <span>{label}</span>
        )}
      </button>

      {status === "error" && errorMessage && (
        <p
          role="alert"
          className="text-center text-xs font-medium text-red-600"
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}
