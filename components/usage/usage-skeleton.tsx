// components/usage/usage-skeleton.tsx
// animate-pulse skeleton components for gauge card and leaderboard table
// Uses design-token classes only. NO hardcoded hex colors. NO shadow-*. Max rounded = rounded (4px).

export function GaugeSkeleton() {
  return (
    <div className="bg-card border border-border rounded p-6 animate-pulse">
      {/* Title placeholder */}
      <div className="h-5 bg-muted rounded w-32 mb-4" />

      {/* Numeric fraction line */}
      <div className="flex justify-between items-center mb-2">
        <div className="h-4 bg-muted rounded w-48" />
        <div className="h-4 bg-muted rounded w-10" />
      </div>

      {/* Progress bar placeholder */}
      <div className="h-2 bg-muted rounded w-full" />
    </div>
  );
}

export function LeaderboardSkeleton() {
  return (
    <div className="bg-card border border-border rounded overflow-hidden animate-pulse">
      {/* Header row */}
      <div className="border-b border-border px-4 py-3 flex gap-4">
        <div className="h-3 bg-muted rounded w-8" />
        <div className="h-3 bg-muted rounded w-48" />
        <div className="h-3 bg-muted rounded w-24 ml-auto" />
        <div className="h-3 bg-muted rounded w-24" />
      </div>

      {/* 5 skeleton rows */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="border-b border-border px-4 py-3 flex gap-4">
          <div className="h-4 bg-muted rounded w-6" />
          <div className="h-4 bg-muted rounded w-44" />
          <div className="h-4 bg-muted rounded w-16 ml-auto" />
          <div className="h-4 bg-muted rounded w-20" />
        </div>
      ))}
    </div>
  );
}

// Composite skeleton for the full usage page
export function UsagePageSkeleton() {
  return (
    <div className="space-y-6">
      <GaugeSkeleton />
      <LeaderboardSkeleton />
    </div>
  );
}
