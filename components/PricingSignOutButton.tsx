"use client";
// omnis-ui/components/PricingSignOutButton.tsx
// Pricing-page escape hatch — Client Component.
//
// Renders the authenticated user's email alongside a "Sign Out" button.
// Mirrors the exact sign-out logic from settings-menu.tsx:
//   1. Call supabase.auth.signOut() to destroy the server-side session cookie.
//   2. Hard-navigate to "/" so the cleared cookie is respected before render.
//
// Shown only when the user is authenticated but not yet subscribed — i.e.
// they have been redirected to /pricing from the DashboardLayout gate.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { LogOut, Loader2 } from "lucide-react";

interface PricingSignOutButtonProps {
  email: string;
}

export function PricingSignOutButton({ email }: PricingSignOutButtonProps) {
  const [signingOut, setSigningOut] = useState(false);
  const router = useRouter();

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    // Hard navigation to root ensures the session cookie is cleared before
    // the page renders, preventing a flash of authenticated content.
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      {/* Authenticated-user badge */}
      <span className="hidden sm:inline-block max-w-[200px] truncate rounded border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
        {email}
      </span>

      {/* Sign Out button */}
      <button
        onClick={handleSignOut}
        disabled={signingOut}
        className="inline-flex items-center gap-1.5 rounded border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition-all hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
        aria-label="Sign out of your account"
      >
        {signingOut ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} aria-hidden="true" />
        ) : (
          <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        )}
        {signingOut ? "Signing out…" : "Sign Out"}
      </button>
    </div>
  );
}
