// omnis-ui/app/api/stripe/webhook/route.ts
// Stripe Webhook Handler — syncs subscription state back into Supabase.
//
// This is the missing half of the billing loop. createCheckoutSession()
// (app/actions/stripe.ts) embeds the org_id in BOTH the session metadata and
// the subscription metadata. Stripe then calls this endpoint on lifecycle
// events; we read org_id from the event and update public.organizations:
//
//   stripe_customer_id   ← proves the org owner completed checkout at least
//                          once. The dashboard layout gate uses a non-null
//                          value as the "checkout completed" signal.
//   subscription_status  ← mapped from the Stripe subscription status into our
//                          CHECK-constrained enum (trialing | active |
//                          past_due | canceled).
//
// SECURITY (Constitution Law II & III):
//   - STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are read only from env —
//     never hardcoded.
//   - The signature is verified against the RAW request body bytes (the same
//     raw-byte principle the platform uses for HMAC verification). We never
//     re-serialize the JSON before verifying. An invalid/missing signature is
//     rejected with 400 — the shield is never lowered for "debugging".
//   - DB writes use the service-role admin client; org_id is taken only from
//     Stripe-verified metadata, never from an untrusted client request.

import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { adminClient } from "@/utils/supabase/admin";

// Stripe signature verification requires the unmodified raw request body, so
// this route must run on the Node.js runtime (not edge) and must not have its
// body parsed/transformed before we read it.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Maps a Stripe subscription status onto our organizations.subscription_status
// CHECK constraint domain: trialing | active | past_due | canceled.
function mapStripeStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      // incomplete / paused / unknown — treat conservatively as past_due so
      // the dashboard gate keeps the org on /pricing until it resolves.
      return "past_due";
  }
}

async function updateOrg(
  orgId: string,
  fields: { stripe_customer_id?: string | null; subscription_status?: string },
): Promise<void> {
  const { error } = await adminClient
    .from("organizations")
    .update(fields)
    .eq("org_id", orgId);

  if (error) {
    console.error("[stripe/webhook] organizations update failed:", error.message);
    throw new Error(`Supabase update failed: ${error.message}`);
  }
}

export async function POST(request: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey || !webhookSecret) {
    console.error(
      "[stripe/webhook] Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET env var.",
    );
    // 500 — misconfiguration, not a client error. Stripe will retry.
    return NextResponse.json(
      { error: "Webhook is not configured." },
      { status: 500 },
    );
  }

  const stripe = new Stripe(secretKey, {
    apiVersion: "2025-02-24.acacia",
    typescript: true,
  });

  // Read the RAW body bytes — required for signature verification.
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header." },
      { status: 400 },
    );
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe/webhook] Signature verification failed:", String(err));
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      // Fired the moment checkout completes. This is the primary signal that
      // an org owner has subscribed — record the customer id immediately so
      // the dashboard gate opens.
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = session.metadata?.orgId;
        if (!orgId) {
          console.error("[stripe/webhook] checkout.session.completed missing orgId metadata.");
          break;
        }

        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id ?? null;

        // A subscription-mode checkout with a 30-day trial lands as 'trialing'.
        await updateOrg(orgId, {
          stripe_customer_id: customerId,
          subscription_status: "trialing",
        });
        break;
      }

      // Fired on trial→active conversion, payment failures, cancellations, etc.
      case "customer.subscription.updated":
      case "customer.subscription.created":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const orgId = subscription.metadata?.orgId;
        if (!orgId) {
          console.error(`[stripe/webhook] ${event.type} missing orgId metadata.`);
          break;
        }

        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer?.id ?? null;

        await updateOrg(orgId, {
          stripe_customer_id: customerId,
          subscription_status:
            event.type === "customer.subscription.deleted"
              ? "canceled"
              : mapStripeStatus(subscription.status),
        });
        break;
      }

      // Payment events keep status in sync with billing health.
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const orgId = invoice.subscription_details?.metadata?.orgId;
        if (orgId) {
          await updateOrg(orgId, { subscription_status: "past_due" });
        }
        break;
      }

      default:
        // Unhandled event types are acknowledged so Stripe stops retrying.
        break;
    }
  } catch (err) {
    console.error("[stripe/webhook] Handler error:", String(err));
    // 500 so Stripe retries — the DB write is the source of truth.
    return NextResponse.json({ error: "Handler failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
