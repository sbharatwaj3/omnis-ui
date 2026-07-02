/**
 * Pure predicate: returns true if and only if the given role should see
 * the "Token Usage" nav card on the main dashboard.
 *
 * Per Requirements 5.1 and 5.2, only admin role sees the nav card.
 * qa_manager, developer, viewer, and null all return false.
 *
 * Exported for property-based testing (Property 10 in design.md).
 */
export function renderTokenUsageCard(role: string | null): boolean {
  return role === "admin";
}
