import type { ActionResult, QuotaData } from "@/app/dashboard/usage/actions";

interface UsageGaugeCardProps {
  result: ActionResult<QuotaData>;
}

export function UsageGaugeCard({ result }: UsageGaugeCardProps) {
  if (result.error) {
    return (
      <div className="bg-[#111827] border border-[#374151] rounded p-6">
        <h2 className="font-['Inter'] text-lg font-medium text-[#f9fafb] mb-3">
          Token Quota
        </h2>
        <p className="text-[#cf202f] font-['Inter'] text-sm">
          ⚠ {result.error.message}
        </p>
      </div>
    );
  }

  const { tokenUnitsUsed, tokenUnitsLimit, usagePct, status } = result.data!;
  const barColor =
    status === "exhausted"
      ? "bg-[#cf202f]"
      : status === "warning"
      ? "bg-[#f4b000]"
      : "bg-[#05b169]";
  const cappedPct = Math.min(usagePct, 100);

  return (
    <div className="bg-[#111827] border border-[#374151] rounded p-6">
      <h2 className="font-['Inter'] text-lg font-medium text-[#f9fafb] mb-4">
        Token Quota
      </h2>

      <div className="flex items-baseline justify-between mb-2">
        <span className="font-['JetBrains_Mono'] text-[13px] font-medium text-[#f9fafb]">
          {tokenUnitsUsed.toLocaleString()} / {tokenUnitsLimit.toLocaleString()} tokens
        </span>
        <span className="font-['JetBrains_Mono'] text-[13px] font-medium text-[#9ca3af]">
          {usagePct}%
        </span>
      </div>

      {/* Flat progress bar — no shadow, max 4px radius */}
      <div className="w-full bg-[#374151] rounded h-2 overflow-hidden">
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
          <span className="rounded-none border border-[#cf202f] bg-transparent text-[#cf202f] text-xs font-semibold uppercase tracking-wider px-2 py-1">
            QUOTA EXHAUSTED
          </span>
        </div>
      )}
    </div>
  );
}
