import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { formatBadgeCount } from "@/components/triage-badge";

// Feature: triage-inbox-resolution, Property 11: Badge displays correct count with 99+ cap
// Validates: Requirements 8.2, 8.3
describe("formatBadgeCount — badge count display with 99+ cap", () => {
  it("returns null for 0, String(n) for 1–99, '99+' for >99", () => {
    fc.assert(
      fc.property(fc.nat(), (n) => {
        const result = formatBadgeCount(n);
        if (n === 0) {
          expect(result).toBeNull();
        } else if (n <= 99) {
          expect(result).toBe(String(n));
        } else {
          expect(result).toBe("99+");
        }
      }),
      { numRuns: 100 }
    );
  });
});
