/**
 * Accessibility tests for Token Usage Dashboard components.
 *
 * Validates: Requirements 7.8, 7.10
 *
 * These tests render each component in jsdom and run axe-core to assert zero
 * critical violations. The framer-motion mock (see __mocks__/framer-motion.tsx)
 * ensures animated wrappers render as plain HTML so axe can scan them cleanly.
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { UsageGaugeCard } from "@/components/usage/usage-gauge-card";
import { LeaderboardTable } from "@/components/usage/leaderboard-table";
import type { QuotaData, DeveloperUsageRow } from "@/app/dashboard/usage/actions";

// Extend vitest's expect with axe matchers.
expect.extend(toHaveNoViolations);

// ── Mock data ────────────────────────────────────────────────────────────────

const mockQuotaData: QuotaData = {
  tokenUnitsUsed: 350,
  tokenUnitsLimit: 500,
  usagePct: 70,
  status: "healthy",
};

const mockRows: DeveloperUsageRow[] = [
  {
    developer_email: "alice@example.com",
    total_logs_uploaded: 42,
    total_tokens_consumed: 12500,
  },
  {
    developer_email: "bob@example.com",
    total_logs_uploaded: 17,
    total_tokens_consumed: 4300,
  },
  {
    developer_email: "Unknown Developer",
    total_logs_uploaded: 3,
    total_tokens_consumed: 800,
  },
];

// ── UsageGaugeCard accessibility ─────────────────────────────────────────────

describe("Accessibility: UsageGaugeCard", () => {
  it("has no critical axe violations in healthy state", async () => {
    const { container } = render(
      <UsageGaugeCard result={{ data: mockQuotaData }} />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no critical axe violations in error state", async () => {
    const { container } = render(
      <UsageGaugeCard result={{ error: { message: "Quota data unavailable." } }} />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no critical axe violations in warning state", async () => {
    const warningData: QuotaData = {
      ...mockQuotaData,
      status: "warning",
      usagePct: 85,
      tokenUnitsUsed: 425,
    };
    const { container } = render(
      <UsageGaugeCard result={{ data: warningData }} />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no critical axe violations in exhausted state", async () => {
    const exhaustedData: QuotaData = {
      ...mockQuotaData,
      status: "exhausted",
      usagePct: 105,
      tokenUnitsUsed: 525,
    };
    const { container } = render(
      <UsageGaugeCard result={{ data: exhaustedData }} />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  // Structural checks (Req 7.8, 7.10)
  it("progress bar has required ARIA attributes", () => {
    const { container } = render(
      <UsageGaugeCard result={{ data: mockQuotaData }} />
    );
    const progressBar = container.querySelector('[role="progressbar"]');
    expect(progressBar).not.toBeNull();
    expect(progressBar?.getAttribute("aria-valuenow")).not.toBeNull();
    expect(progressBar?.getAttribute("aria-valuemin")).not.toBeNull();
    expect(progressBar?.getAttribute("aria-valuemax")).not.toBeNull();
    expect(progressBar?.getAttribute("aria-label")).not.toBeNull();
  });
});

// ── LeaderboardTable accessibility ───────────────────────────────────────────

describe("Accessibility: LeaderboardTable", () => {
  it("has no critical axe violations with data", async () => {
    const { container } = render(
      <LeaderboardTable rows={mockRows} />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no critical axe violations in empty state", async () => {
    const { container } = render(
      <LeaderboardTable rows={[]} activeFilterLabel="last 30 days" />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no critical axe violations with single row", async () => {
    const { container } = render(
      <LeaderboardTable rows={[mockRows[0]]} />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  // Structural checks (Req 7.8, 7.10)
  it("table has aria-label", () => {
    const { container } = render(
      <LeaderboardTable rows={mockRows} />
    );
    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    expect(table?.getAttribute("aria-label")).not.toBeNull();
  });

  it("th elements have scope='col'", () => {
    const { container } = render(
      <LeaderboardTable rows={mockRows} />
    );
    const headers = container.querySelectorAll("th");
    expect(headers.length).toBeGreaterThan(0);
    headers.forEach((th) => {
      expect(th.getAttribute("scope")).toBe("col");
    });
  });

  it("tbody has role='rowgroup'", () => {
    const { container } = render(
      <LeaderboardTable rows={mockRows} />
    );
    const tbody = container.querySelector("tbody");
    expect(tbody).not.toBeNull();
    expect(tbody?.getAttribute("role")).toBe("rowgroup");
  });
});
