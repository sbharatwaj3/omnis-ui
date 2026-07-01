"use server";

import Stripe from "stripe";
import { createClient } from "@/utils/supabase/server";

/**
 * Creates a Stripe Checkout Session for a subscription purchase.
 *
 * Security Standard §II.2: org_id is NEVER accepted as a client-supplied
 * argument. It is re-derived from the verified server-side session so that a
 * malicious client cannot create a checkout session stamped with a foreign
 * org_id and trigger a Stripe webhook that updates another org's subscription.
 *
 * @param priceId - Optional override for the Stripe Price ID. Defaults to
 *                  STRIPE_PRICE_ID env var (the primary plan price).
 * @returns The Stripe-hosted checkout session URL, or throws on failure.
 */
export async function createCheckoutSession(
  priceId?: string,
): Promise<string | null> {
  // -- Step 1: Verify session and derive org_id from JWT (never from client) -
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Unauthorized: valid session required to initiate checkout.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile?.org_id) {
    throw new Error(
      "Could not resolve your organization. Please complete onboarding before subscribing.",
    );
  }

  const orgId: string = profile.org_id;

  // -- Step 2: Guard: require STRIPE_SECRET_KEY before constructing client ---
  // Checked here (not at module level) so a missing key throws only when the
  // user actually clicks a CTA button — never during page render.
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to your Vercel Environment Variables before initiating checkout.",
    );
  }

  // Lazy-initialise the Stripe client inside the action invocation.
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
    // orgId is sourced exclusively from the verified session above.
    // Stored at the subscription level (every invoice event) AND at the
    // session level (checkout.session.completed).
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
    success_url: `${appUrl}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/pricing?checkout=cancelled`,

    allow_promotion_codes: true,
    automatic_tax: { enabled: false },
  });

  return session.url;
}
