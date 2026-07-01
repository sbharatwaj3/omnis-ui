import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Omnis RegOps Root Layout
//
// LIGHT-MODE LOCK: This layout is hardcoded to render in light mode. There is
// no ThemeProvider, no `next-themes` dependency, and no runtime theme switch.
// The `<html>` tag is locked to className="light" with style colorScheme:"light"
// so that OS-level dark preferences cannot override the application palette.
//
// TYPOGRAPHY:
//   Inter          → all structural UI: navigation, buttons, body copy
//   JetBrains Mono → all FDA telemetry: log IDs, timestamps, CFR refs, hashes
//                    exposed via --font-geist-mono so all downstream font-mono
//                    classes continue to resolve without a sweep.
// ---------------------------------------------------------------------------

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
  // Weight range covering the data display weights we actually use
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Qavro | FDA Assurance",
  description:
    "Automated eSTAR compliance, IEC 62304 traceability, and CI/CD evidence capture for modern MedTech.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "light h-full antialiased font-sans",
        inter.variable,
        jetbrainsMono.variable,
      )}
      style={{ colorScheme: "light" }}
    >
      <body className="min-h-full flex flex-col bg-white text-slate-900">
        {children}
      </body>
    </html>
  );
}
