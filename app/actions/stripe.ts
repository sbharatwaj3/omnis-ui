// omnis-ui/app/actions/stripe.ts
// Server Action -- Stripe Checkout Session Creator
//
// Responsibilities:
//   1. Initialise a Stripe client using the server-only STRIPE_SECRET_KEY.
//   2. Create a subscription-mode checkout session for the given orgId.
//   3. Embed orgId in BOTH subscription_data.metadata AND session-level metadata
//      so the future /api/stripe/webhook can identify the organization on
//      both invoice.payment_succeeded and checkout.session.completed events.
//   4. Return the Stripe-hosted checkout URL for client-side redirect.
//
// Security notes:
//   - "use server" ensures this code never ships to the browser bundle.
//   - STRIPE_SECRET_KEY and STRIPE_PRICE_ID are read exclusively from env;
//     they are NEVER referenced as literals in this file.
//
// IMPORTANT -- lazy initialisation:
//   The Stripe client is instantiated INSIDE createCheckoutSession, not at
//   module load time. This prevents the Stripe() constructor from throwing
//   during Server Component render if STRIPE_SECRET_KEY is missing from the
//   environment, which would crash the entire /pricing page render tree and
//   produce the "An error occurred in the Server Components render" message.

"use server";

import Stripe from "stripe";

/**
 * Creates a Stripe Checkout Session for a subscription purchase.
 *
 * @param orgId   - The Supabase org_id UUID of the purchasing organization.
 *                  Embedded in metadata so the webhook can map the subscription
 *                  back to the correct `organizations` row.
 * @param priceId - Optional override for the Stripe Price ID. Defaults to
 *                  STRIPE_PRICE_ID env var (the primary plan price).
 * @returns The Stripe-hosted checkout session URL, or throws on failure.
 */
export async function createCheckoutSession(
  orgId: string,
  priceId?: string,
): Promise<string | null> {
  // -- Guard: require STRIPE_SECRET_KEY before constructing the client -------
  // Checked here (not at module level) so a missing key throws only when the
  // user actually clicks a CTA button -- never during page render.
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to your Vercel Environment Variables before initiating checkout.",
    );
  }

  // Lazy-initialise the Stripe client inside the action invocation.
  // This avoids a module-load-time crash when the env var is absent.
  const stripe = new Stripe(secretKey, {
    apiVersion: "2025-02-24.acacia",
    typescript: true,
  });

  const resolvedPriceId = priceId ?? process.env.STRIPE_PRICE_ID;

  if (!resolvedPriceId) {
    throw new Error(
      "STRIPE_PRICE_ID is not set. Configure it in .env.local (or Vercel env vars) before initiating checkout.",
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

    // -- Webhook identification -----------------------------------------------
    // orgId is stored at the subscription level (available on every invoice
    // event) AND at the session level (available on checkout.session.completed).
    subscription_data: {
      trial_period_days: 30,
      metadata: {
        orgId,
      },
    },
    metadata: {
      orgId,
    },

    // -- Post-checkout routing -------------------------------------------------
    // CHECKOUT_SESSION_ID is a Stripe template variable substituted server-side.
    success_url: `${appUrl}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/pricing?checkout=cancelled`,

    // Allow promotion/coupon codes at checkout (enables 100% off testing codes).
    allow_promotion_codes: true,

    // Allow Stripe's smart UI to collect billing address where required by tax law.
    automatic_tax: { enabled: false },
  });

  return session.url;
}
