"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { DeveloperUsageRow } from "@/app/dashboard/usage/actions";

interface LeaderboardTableProps {
  rows: DeveloperUsageRow[];
  activeFilterLabel?: string; // e.g. "last 30 days" — for empty state message
}

export function LeaderboardTable({ rows, activeFilterLabel }: LeaderboardTableProps) {
  return (
    <div className="bg-card border border-border rounded overflow-hidden">
      <table
        className="w-full"
        aria-label="Developer token usage leaderboard"
      >
        <caption className="sr-only">Developer token usage leaderboard</caption>
        <thead>
          <tr className="border-b border-border">
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.5px] text-muted-foreground"
            >
              Rank
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.5px] text-muted-foreground"
            >
              Developer Email
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.5px] text-muted-foreground"
            >
              Logs Uploaded
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.5px] text-muted-foreground"
            >
              Total Tokens
            </th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={4}
                className="px-4 py-3 text-center text-sm text-muted-foreground"
              >
                No usage recorded{activeFilterLabel ? ` in the ${activeFilterLabel}` : ""}.
              </td>
            </tr>
          ) : (
            <AnimatePresence mode="sync">
              {rows.map((row, index) => (
                <motion.tr
                  key={row.developer_email}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="border-b border-border hover:bg-muted transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-[13px] font-medium text-foreground">
                    {index + 1}
                  </td>
                  <td className="px-4 py-3 font-mono text-[13px] font-medium text-foreground">
                    {row.developer_email}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[13px] font-medium text-foreground">
                    {row.total_logs_uploaded.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[13px] font-medium text-foreground">
                    {row.total_tokens_consumed.toLocaleString()}
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          )}
        </tbody>
      </table>
    </div>
  );
}
