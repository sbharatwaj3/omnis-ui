// Feature: triage-inbox-resolution, Property 12: Badge is only visible to admin and qa_manager roles
// Validates: Requirement 8.4

import fc from "fast-check";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import React from "react";
import { TriageBadge } from "@/components/triage-badge";

describe("TriageBadge — role visibility", () => {
  afterEach(() => {
    cleanup();
  });

  it("is absent for developer and viewer, present for admin and qa_manager", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("developer", "viewer", "admin", "qa_manager"),
        (role) => {
          const { container, unmount } = render(
            React.createElement(TriageBadge, { count: 5, role })
          );
          if (role === "developer" || role === "viewer") {
            expect(container.firstChild).toBeNull();
          } else {
            expect(container.firstChild).not.toBeNull();
          }
          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
