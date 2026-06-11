"use client";
// omnis-ui/components/theme-provider.tsx
// Thin wrapper around next-themes ThemeProvider.
// Keeps the root layout a Server Component — next-themes requires a
// "use client" boundary which we isolate here.

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ThemeProviderProps } from "next-themes";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
