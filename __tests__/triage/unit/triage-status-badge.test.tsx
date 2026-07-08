// Feature: triage-inbox-resolution
// Unit tests: TriageStatusBadge renders correct classes for each status
// Requirements: 11.5

import { render } from '@testing-library/react';
import { TriageStatusBadge } from '@/components/triage-status-badge';

describe('TriageStatusBadge', () => {
  const statuses = ['pending', 'approved', 'rejected'] as const;

  // Helper: get all className strings from the rendered output
  function getRenderedClasses(container: HTMLElement): string {
    return Array.from(container.querySelectorAll('[class]'))
      .map((el) => el.getAttribute('class') ?? '')
      .join(' ');
  }

  it('renders rounded-none for "pending"', () => {
    const { container } = render(<TriageStatusBadge status="pending" />);
    const classes = getRenderedClasses(container);
    expect(classes).toContain('rounded-none');
  });

  it('renders correct border/text classes for "pending"', () => {
    const { container } = render(<TriageStatusBadge status="pending" />);
    const classes = getRenderedClasses(container);
    expect(classes).toContain('border-yellow-500');
    expect(classes).toContain('text-yellow-500');
  });

  it('renders correct border/text classes for "approved"', () => {
    const { container } = render(<TriageStatusBadge status="approved" />);
    const classes = getRenderedClasses(container);
    expect(classes).toContain('border-green-500');
    expect(classes).toContain('text-green-500');
  });

  it('renders correct border/text classes for "rejected"', () => {
    const { container } = render(<TriageStatusBadge status="rejected" />);
    const classes = getRenderedClasses(container);
    expect(classes).toContain('border-red-500');
    expect(classes).toContain('text-red-500');
  });

  it.each(statuses)('renders rounded-none for "%s"', (status) => {
    const { container } = render(<TriageStatusBadge status={status} />);
    const classes = getRenderedClasses(container);
    expect(classes).toContain('rounded-none');
  });

  it.each(statuses)('renders no shadow class for "%s"', (status) => {
    const { container } = render(<TriageStatusBadge status={status} />);
    const html = container.innerHTML;
    expect(html).not.toContain('shadow');
  });

  it.each(statuses)('renders no forbidden rounded variant for "%s"', (status) => {
    const { container } = render(<TriageStatusBadge status={status} />);
    const classes = getRenderedClasses(container);
    expect(classes).not.toContain('rounded-md');
    expect(classes).not.toContain('rounded-lg');
    expect(classes).not.toContain('rounded-xl');
    expect(classes).not.toContain('rounded-full');
    expect(classes).not.toContain('rounded-sm');
  });
});
