"use client";
// omnis-ui/components/terminal-block.tsx
// Dark terminal code block with a one-click copy button.
//
// Props:
//   code       — the command string to display and copy
//   lang       — language label shown in the top-right (cosmetic only)
//   prominent  — if true, renders with a slightly larger font and extra padding
//                for the primary "run this" command

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface TerminalBlockProps {
  code: string;
  lang?: string;
  prominent?: boolean;
}

export function TerminalBlock({
  code,
  lang,
  prominent = false,
}: TerminalBlockProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Fallback: create a temporary textarea and execCommand
      const el = document.createElement("textarea");
      el.value = code;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-zinc-700/60 bg-zinc-900 dark:border-zinc-700",
        prominent ? "shadow-lg" : "shadow-sm",
      )}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-zinc-700/60 bg-zinc-800/80 px-4 py-2">
        {/* Traffic-light dots */}
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-600" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-600" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-600" />
        </div>

        {/* Lang label */}
        {lang && (
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            {lang}
          </span>
        )}

        {/* Copy button */}
        <button
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy to clipboard"}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-all",
            copied
              ? "text-emerald-400"
              : "text-zinc-500 hover:bg-zinc-700/60 hover:text-zinc-200",
          )}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" strokeWidth={2.5} />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" strokeWidth={1.75} />
              Copy
            </>
          )}
        </button>
      </div>

      {/* Code body */}
      <div
        className={cn(
          "overflow-x-auto px-4",
          prominent ? "py-4" : "py-3",
        )}
      >
        <pre
          className={cn(
            "font-mono text-zinc-100",
            prominent ? "text-sm" : "text-xs",
          )}
        >
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}
