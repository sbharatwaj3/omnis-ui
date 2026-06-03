"use client";
// omnis-ui/components/clickable-table-row.tsx
// A thin client component that wraps a TableRow and handles click navigation.
// Keeping this isolated means the parent dashboard page stays a Server Component.

import { useRouter } from "next/navigation";
import { TableRow } from "@/components/ui/table";

interface ClickableTableRowProps {
  logId: string;
  isCritical: boolean;
  children: React.ReactNode;
}

export function ClickableTableRow({
  logId,
  isCritical,
  children,
}: ClickableTableRowProps) {
  const router = useRouter();

  return (
    <TableRow
      onClick={() => router.push(`/logs/${logId}`)}
      className={[
        "cursor-pointer transition-colors",
        isCritical
          ? "bg-red-50/60 hover:bg-red-100"
          : "hover:bg-zinc-100/80",
      ].join(" ")}
    >
      {children}
    </TableRow>
  );
}
