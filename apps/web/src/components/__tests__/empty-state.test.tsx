import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Inbox } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

describe('EmptyState', () => {
  it('renders an icon, a title, a description and a call to action', () => {
    render(
      <EmptyState
        icon={<Inbox data-testid="empty-state-icon" />}
        title="No campaigns yet"
        description="Create your first campaign to start tracking attributed revenue."
        action={<Button>Create a campaign</Button>}
      />,
    );

    expect(screen.getByText('No campaigns yet')).toBeInTheDocument();
    expect(
      screen.getByText('Create your first campaign to start tracking attributed revenue.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create a campaign' })).toBeInTheDocument();
    expect(screen.getByTestId('empty-state-icon')).toBeInTheDocument();
  });

  it('works without a description or an action', () => {
    render(<EmptyState title="No orders yet" />);

    expect(screen.getByText('No orders yet')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('never renders a fake metric or the word ROI', () => {
    const { container } = render(<EmptyState title="Nothing here" description="No data yet." />);

    expect(container.textContent).not.toMatch(/ROI/i);
    expect(container.textContent).not.toMatch(/\d+(\.\d+)?%/);
  });
});
