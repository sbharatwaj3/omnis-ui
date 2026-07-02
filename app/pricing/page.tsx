// omnis-ui/app/pricing/page.tsx
// Omnis RegOps - SaaS Pricing Page
//
// Three-tier pricing designed around Bedrock token consumption:
//   Starter  $499/mo   - 500 token-units    (teams getting started)
//   Growth   $899/mo   - 1,200 token-units  (active MedTech teams; 10% vs raw cost)
//   Scale    $1,399/mo - 2,500 token-units  (high-volume; $500 cheaper than overage)
//
// Page is a pure Server Component. Auth is resolved here; the result is passed
// as serialisable props to PricingClientShell (a "use client" boundary) so that
// framer-motion animations run client-side without leaking server utilities.

import { createClient } from "@/utils/supabase/server";
import { PricingClientShell } from "./PricingClientShell";

export default async function PricingPage() {
  // Resolve authentication server-side. orgId and userEmail are plain strings
  // that are safe to pass across the server→client boundary.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let orgId: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("users")
      .select("org_id")
      .eq("user_id", user.id)
      .single();
    orgId = profile?.org_id ?? null;
  }

  const userEmail = user?.email ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <PricingClientShell orgId={orgId} userEmail={userEmail} />
    </div>
  );
}
