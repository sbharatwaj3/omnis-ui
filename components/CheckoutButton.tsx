"use client";
// omnis-ui/components/CheckoutButton.tsx
// Client Component — Stripe Checkout initiator button.
//
// Responsibilities:
//   1. Accept orgId and an optional priceId (for multi-tier pricing).
//   2. Invoke the `createCheckoutSession` server action on click.
//   3. Manage a loading/redirecting state with a spinner.
//   4. Hard-redirect to the Stripe-hosted checkout URL.
//   5. Surface any errors inline without crashing the page.

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createCheckoutSession } from "@/app/actions/stripe";

interface CheckoutButtonProps {
  /** The Supabase org_id of the purchasing organization. */
  orgId: string;
  /** Optional Stripe Price ID override — allows multi-tier checkout buttons. */
  priceId?: string;
  /** Button label. Defaults to "Get Started". */
  label?: string;
  /** Tailwind class overrides for the button wrapper. */
  className?: string;
}

export function CheckoutButton({
  orgId,
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
      const url = await createCheckoutSession(orgId, priceId);

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
          "inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-slate-900 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-slate-900/20 transition-all hover:bg-slate-800 hover:shadow-slate-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-500 dark:text-slate-900 dark:shadow-emerald-900/30 dark:hover:bg-emerald-400 dark:focus-visible:ring-emerald-500"
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
          className="text-center text-xs font-medium text-red-600 dark:text-red-400"
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}
