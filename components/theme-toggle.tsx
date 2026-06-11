"use client";
// omnis-ui/components/theme-toggle.tsx
// Sun / Moon toggle button — cycles between light and dark themes.
//
// Uses useTheme() from next-themes. The button is intentionally small so it
// slots cleanly into any header alongside other icon buttons (e.g. SettingsMenu).
// resolvedTheme is used instead of theme so the correct icon shows during SSR
// hydration (avoids a flash when system preference is dark).

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // Avoid hydration mismatch — only render the icon after mount
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  function toggle() {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }

  return (
    <button
      onClick={toggle}
      aria-label={mounted ? `Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode` : "Toggle theme"}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
    >
      {/* Render a neutral placeholder icon until mounted to prevent flash */}
      {!mounted ? (
        <Sun className="h-4 w-4 opacity-0" />
      ) : resolvedTheme === "dark" ? (
        <Sun className="h-4 w-4" strokeWidth={1.75} />
      ) : (
        <Moon className="h-4 w-4" strokeWidth={1.75} />
      )}
    </button>
  );
}
