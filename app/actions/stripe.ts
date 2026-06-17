// omnis-ui/app/actions/stripe.ts
// Server Action — Stripe Checkout Session Creator
//
// Responsibilities:
//   1. Initialise a Stripe client using the server-only STRIPE_SECRET_KEY.
//   2. Create a subscription-mode checkout session for the given orgId.
//   3. Embed orgId in BOTH subscription_data.metadata AND session-level metadata
//      so the future /api/stripe/webhook can identify the organisation on
//      both invoice.payment_succeeded and checkout.session.completed events.
//   4. Return the Stripe-hosted checkout URL for client-side redirect.
//
// Security notes:
//   - "use server" ensures this code never ships to the browser bundle.
//   - STRIPE_SECRET_KEY and STRIPE_PRICE_ID are read exclusively from env;
//     they are NEVER referenced as literals in this file.

"use server";

import Stripe from "stripe";

// Initialise once per cold start — Stripe recommends a single shared instance.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2025-02-24.acacia",
  typescript: true,
});

/**
 * Creates a Stripe Checkout Session for a subscription purchase.
 *
 * @param orgId - The Supabase `org_id` UUID of the purchasing organisation.
 *                Embedded in metadata so the webhook can map the subscription
 *                back to the correct `organizations` row.
 * @param priceId - Optional override for the Stripe Price ID. Defaults to
 *                  STRIPE_PRICE_ID env var (the primary "Pro" plan).
 * @returns The Stripe-hosted checkout session URL, or null on failure.
 */
export async function createCheckoutSession(
  orgId: string,
  priceId?: string,
): Promise<string | null> {
  const resolvedPriceId = priceId ?? process.env.STRIPE_PRICE_ID;

  if (!resolvedPriceId) {
    throw new Error(
      "STRIPE_PRICE_ID is not set. Configure it in .env.local before initiating checkout.",
    );
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",

    line_items: [
      {
        price: resolvedPriceId,
        quantity: 1,
      },
    ],

    // ── Webhook identification ─────────────────────────────────────────────
    // orgId is stored at the subscription level (available on every invoice
    // event) AND at the session level (available on checkout.session.completed).
    subscription_data: {
      metadata: {
        orgId,
      },
    },
    metadata: {
      orgId,
    },

    // ── Post-checkout routing ──────────────────────────────────────────────
    // CHECKOUT_SESSION_ID is a Stripe template variable substituted server-side.
    success_url: `${appUrl}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/pricing?checkout=cancelled`,

    // Allow Stripe's smart UI to collect billing address where required by tax law
    automatic_tax: { enabled: false },
  });

  return session.url;
}
