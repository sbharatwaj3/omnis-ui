import type { ActionResult, QuotaData } from "@/app/dashboard/usage/actions";

interface UsageGaugeCardProps {
  result: ActionResult<QuotaData>;
}

export function UsageGaugeCard({ result }: UsageGaugeCardProps) {
  if (result.error) {
    return (
      <div className="bg-card border border-border rounded p-6">
        <h2 className="text-lg font-medium text-foreground mb-3">
          Token Quota
        </h2>
        <p className="text-destructive text-sm">
          ⚠ {result.error.message}
        </p>
      </div>
    );
  }

  const { tokenUnitsUsed, tokenUnitsLimit, usagePct, status } = result.data!;
  const barColor =
    status === "exhausted"
      ? "bg-destructive"
      : status === "warning"
      ? "bg-yellow-500"
      : "bg-green-600";
  const cappedPct = Math.min(usagePct, 100);

  return (
    <div className="bg-card border border-border rounded p-6">
      <h2 className="text-lg font-medium text-foreground mb-4">
        Token Quota
      </h2>

      <div className="flex items-baseline justify-between mb-2">
        <span className="font-mono text-[13px] font-medium text-foreground">
          {tokenUnitsUsed.toLocaleString()} / {tokenUnitsLimit.toLocaleString()} tokens
        </span>
        <span className="font-mono text-[13px] font-medium text-muted-foreground">
          {usagePct}%
        </span>
      </div>

      {/* Flat progress bar — no shadow, max 4px radius */}
      <div className="w-full bg-muted rounded h-2 overflow-hidden">
        <div
          role="progressbar"
          aria-valuenow={cappedPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Token quota usage"
          className={`h-2 rounded ${barColor} transition-none`}
          style={{ width: `${cappedPct}%` }}
        />
      </div>

      {status === "exhausted" && (
        <div className="mt-3">
          <span className="rounded-none border border-destructive bg-transparent text-destructive text-xs font-semibold uppercase tracking-wider px-2 py-1">
            QUOTA EXHAUSTED
          </span>
        </div>
      )}
    </div>
  );
}
