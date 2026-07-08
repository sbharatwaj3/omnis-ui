// Feature: triage-inbox-resolution
// Unit tests: TriageBadge does not render when count is zero
// Requirements: 8.2

import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TriageBadge } from "@/components/triage-badge";

describe("TriageBadge — zero count gate", () => {
  it("renders nothing for count=0 and role='admin'", () => {
    const { container } = render(<TriageBadge count={0} role="admin" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for count=0 and role='qa_manager'", () => {
    const { container } = render(<TriageBadge count={0} role="qa_manager" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders badge showing '1' for count=1 and role='admin'", () => {
    const { container } = render(<TriageBadge count={1} role="admin" />);
    expect(container.firstChild).not.toBeNull();
    expect(container.textContent).toBe("1");
  });

  it("renders badge showing '99+' for count=100 and role='qa_manager'", () => {
    const { container } = render(<TriageBadge count={100} role="qa_manager" />);
    expect(container.firstChild).not.toBeNull();
    expect(container.textContent).toBe("99+");
  });
});
