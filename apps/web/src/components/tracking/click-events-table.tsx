'use client';

import * as React from 'react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { MousePointerClick } from 'lucide-react';

import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useApiResource } from '@/lib/use-api-resource';
import { useSession } from '@/lib/session';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TrackingEvent } from '@salestrace/shared-types';

export function ClickEventsTable({
  campaignId,
  pageSize = 25,
}: {
  campaignId?: string;
  pageSize?: number;
}) {
  const { organization } = useSession();
  const [pageIndex, setPageIndex] = React.useState(0);
  const [campaignFilter, setCampaignFilter] = React.useState('all');
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const campaigns = useApiResource(() => api.campaigns.list({ limit: 100 }), []);

  const events = useApiResource(
    () =>
      api.tracking.events({
        campaignId: campaignId ?? (campaignFilter === 'all' ? undefined : campaignFilter),
        limit: pageSize,
        offset: pageIndex * pageSize,
      }),
    [campaignId, campaignFilter, pageIndex, pageSize],
  );

  const columns = React.useMemo<ColumnDef<TrackingEvent>[]>(
    () => [
      {
        accessorKey: 'occurredAt',
        header: 'Clicked',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            {formatDateTime(row.original.occurredAt, organization?.timezone)}
          </span>
        ),
      },
      {
        accessorKey: 'campaignName',
        header: 'Campaign',
        enableSorting: false,
        cell: ({ row }) => <span className="text-sm">{row.original.campaignName}</span>,
      },
      {
        accessorKey: 'creatorName',
        header: 'Creator',
        enableSorting: false,
        cell: ({ row }) => <span className="text-sm">{row.original.creatorName}</span>,
      },
      {
        accessorKey: 'repeatCount',
        header: 'Repeat count',
        enableSorting: false,
        cell: ({ row }) => <span className="tabular-nums">{row.original.repeatCount}</span>,
      },
      {
        accessorKey: 'referrer',
        header: 'Referrer',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="max-w-[280px] truncate text-sm text-muted-foreground">
            {row.original.referrer ?? '—'}
          </span>
        ),
      },
    ],
    [organization?.timezone],
  );

  return (
    <DataTable
      caption="Recorded click events"
      columns={columns}
      data={events.data?.items ?? []}
      pageIndex={pageIndex}
      pageSize={pageSize}
      total={events.data?.total ?? 0}
      onPageChange={setPageIndex}
      sorting={sorting}
      onSortingChange={setSorting}
      isLoading={events.loading}
      toolbar={
        campaignId ? null : (
          <div className="space-y-1.5">
            <Label htmlFor="click-events-campaign" className="text-xs text-muted-foreground">
              Campaign
            </Label>
            <Select value={campaignFilter} onValueChange={setCampaignFilter}>
              <SelectTrigger id="click-events-campaign" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All campaigns</SelectItem>
                {(campaigns.data?.items ?? []).map((campaign) => (
                  <SelectItem key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )
      }
      emptyState={
        <EmptyState
          icon={<MousePointerClick className="h-5 w-5" />}
          title="No clicks recorded yet"
          description="Clicks appear here once a creator shares a tracking link and a customer opens it."
        />
      }
    />
  );
}
