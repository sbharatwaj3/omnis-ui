/**
 * TriageSkeleton
 *
 * Suspense fallback for the Triage Inbox. Renders exactly 3 animate-pulse
 * placeholder cards that match the expected footprint of a loaded TriageItemCard.
 *
 * Design system compliance (MedTech Slate refresh):
 * - bg-slate-800 dark surface (softer than bg-gray-900)
 * - border border-slate-700 hairline border
 * - rounded-sm (max 4px border radius)
 * - No shadow-*, no arbitrary Tailwind values
 *
 * Requirements: 10.1, 10.2, 10.3
 */

const SKELETON_COUNT = 3;

export function TriageSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading triage items">
      {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
        <div
          key={index}
          className="bg-slate-800 border border-slate-700 rounded-sm p-4 animate-pulse"
        >
          {/* Header row — badge placeholder + ID + timestamp */}
          <div className="flex items-center gap-3 mb-3">
            <div className="h-4 bg-slate-700 rounded-sm w-16" />
            <div className="h-3 bg-slate-700 rounded-sm w-32 ml-auto" />
          </div>

          {/* req_id comparison row — two columns */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="h-3 bg-slate-700 rounded-sm" />
            <div className="h-3 bg-slate-700 rounded-sm" />
          </div>

          {/* Reasoning toggle placeholder */}
          <div className="h-3 bg-slate-700 rounded-sm w-40" />
        </div>
      ))}
    </div>
  );
}
