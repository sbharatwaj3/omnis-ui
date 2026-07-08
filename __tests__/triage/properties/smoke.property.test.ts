// Feature: triage-inbox-resolution, Property 0 (smoke): fast-check runs in Vitest
import fc from "fast-check";
import { describe, it, expect } from "vitest";

describe("smoke: fast-check runs in Vitest", () => {
  it("fc.nat() always produces non-negative integers", () => {
    fc.assert(
      fc.property(fc.nat(), (n) => {
        expect(n).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 100 },
    );
  });
});
