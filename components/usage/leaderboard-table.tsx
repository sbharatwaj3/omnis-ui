"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { DeveloperUsageRow } from "@/app/dashboard/usage/actions";

interface LeaderboardTableProps {
  rows: DeveloperUsageRow[];
  activeFilterLabel?: string; // e.g. "last 30 days" — for empty state message
}

export function LeaderboardTable({ rows, activeFilterLabel }: LeaderboardTableProps) {
  return (
    <div className="bg-[#111827] border border-[#374151] rounded overflow-hidden">
      <table
        className="w-full"
        aria-label="Developer token usage leaderboard"
      >
        <caption className="sr-only">Developer token usage leaderboard</caption>
        <thead>
          <tr className="border-b border-[#374151]">
            <th
              scope="col"
              className="px-4 py-3 text-left font-['Inter'] text-xs font-semibold uppercase tracking-[0.5px] text-[#9ca3af]"
            >
              Rank
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left font-['Inter'] text-xs font-semibold uppercase tracking-[0.5px] text-[#9ca3af]"
            >
              Developer Email
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-right font-['Inter'] text-xs font-semibold uppercase tracking-[0.5px] text-[#9ca3af]"
            >
              Logs Uploaded
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-right font-['Inter'] text-xs font-semibold uppercase tracking-[0.5px] text-[#9ca3af]"
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
                className="px-4 py-3 text-center font-['Inter'] text-sm text-[#9ca3af]"
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
                  className="border-b border-[#374151] hover:bg-[#1f2937] transition-colors"
                >
                  <td className="px-4 py-3 font-['JetBrains_Mono'] text-[13px] font-medium text-[#f9fafb]">
                    {index + 1}
                  </td>
                  <td className="px-4 py-3 font-['JetBrains_Mono'] text-[13px] font-medium text-[#f9fafb]">
                    {row.developer_email}
                  </td>
                  <td className="px-4 py-3 text-right font-['JetBrains_Mono'] text-[13px] font-medium text-[#f9fafb]">
                    {row.total_logs_uploaded.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-['JetBrains_Mono'] text-[13px] font-medium text-[#f9fafb]">
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
