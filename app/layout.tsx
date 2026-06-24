import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Omnis RegOps Root Layout
//
// LIGHT-MODE LOCK: This layout is hardcoded to render in light mode. There is
// no ThemeProvider, no `next-themes` dependency, and no runtime theme switch.
// The `<html>` tag is locked to className="light" with style colorScheme:"light"
// so that OS-level dark preferences cannot override the application palette.
// ---------------------------------------------------------------------------

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "QAVRO | FDA Assurance",
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
        geistSans.variable,
        geistMono.variable,
        inter.variable,
      )}
      style={{ colorScheme: "light" }}
    >
      <body className="min-h-full flex flex-col bg-white text-slate-900">
        {children}
      </body>
    </html>
  );
}
