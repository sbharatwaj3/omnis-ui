"use client";
// omnis-ui/components/settings-menu.tsx
// Settings dropdown for the Dashboard header.
//
// Client Component — requires browser APIs for Supabase sign-out and router.
// Renders a Settings icon that opens a dropdown with navigation to the
// dedicated Settings page and a Sign Out action.
// On successful sign-out, clears the session and redirects to root (/).

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Settings, LogOut, Loader2, SlidersHorizontal } from "lucide-react";

export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

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
    <div className="relative" ref={menuRef}>
      {/* Settings trigger button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Settings"
        aria-expanded={open}
        aria-haspopup="true"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
      >
        <Settings className="h-4 w-4" strokeWidth={1.75} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-10 z-50 min-w-[180px] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          {/* Section label */}
          <div className="border-b border-zinc-100 px-4 py-2.5 dark:border-zinc-800">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
              Workspace
            </p>
          </div>

          {/* Settings page link */}
          <div className="px-1 py-1">
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                router.push("/dashboard/settings");
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
              Settings
            </button>
          </div>

          {/* Divider */}
          <div className="mx-1 border-t border-zinc-100 dark:border-zinc-800" />

          {/* Sign Out */}
          <div className="px-1 py-1">
            <button
              role="menuitem"
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
            >
              {signingOut ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
              ) : (
                <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
              )}
              {signingOut ? "Signing out…" : "Sign Out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
