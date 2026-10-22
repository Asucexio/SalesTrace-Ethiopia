'use client';

import * as React from 'react';
import { QrCode } from 'lucide-react';

import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useApiResource } from '@/lib/use-api-resource';
import { useSession } from '@/lib/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import type { TrackingLink } from '@salestrace/shared-types';

import { CopyButton } from '@/components/shared/copy-button';
import { NewTrackingLinkDialog } from '@/components/tracking/new-tracking-link-dialog';

export function TrackingLinksTable({
  campaignId,
  canWrite,
  pageSize = 25,
}: {
  campaignId?: string;
  canWrite: boolean;
  pageSize?: number;
}) {
  const { organization } = useSession();
  const [pageIndex, setPageIndex] = React.useState(0);
  const [campaignFilter, setCampaignFilter] = React.useState('all');
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const campaigns = useApiResource(() => api.campaigns.list({ limit: 100 }), []);

  const links = useApiResource(
    () =>
      api.tracking.links({
        campaignId: campaignId ?? (campaignFilter === 'all' ? undefined : campaignFilter),
        limit: pageSize,
        offset: pageIndex * pageSize,
      }),
    [campaignId, campaignFilter, pageIndex, pageSize],
  );

  const columns = React.useMemo<ColumnDef<TrackingLink>[]>(
    () => [
      {
        accessorKey: 'label',
        header: 'Label',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="min-w-[160px]">
            <p className="font-medium">{row.original.label ?? 'Untitled link'}</p>
            <p className="font-mono text-xs text-muted-foreground">{row.original.code}</p>
          </div>
        ),
      },
      {
        accessorKey: 'creatorName',
        header: 'Creator',
        enableSorting: false,
        cell: ({ row }) => <span className="text-sm">{row.original.creatorName}</span>,
      },
      {
        accessorKey: 'campaignName',
        header: 'Campaign',
        enableSorting: false,
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.campaignName}</span>,
      },
      {
        accessorKey: 'url',
        header: 'Tracking URL',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex min-w-[260px] items-center gap-2">
            <code className="truncate rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              {row.original.url}
            </code>
            <CopyButton value={row.original.url} label="Copy URL" size="icon" />
          </div>
        ),
      },
      {
        accessorKey: 'channel',
        header: 'Channel',
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant="outline" className="capitalize">
            {row.original.channel}
          </Badge>
        ),
      },
      {
        accessorKey: 'isActive',
        header: 'Status',
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? 'success' : 'muted'}>
            {row.original.isActive ? 'Active' : 'Inactive'}
          </Badge>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: 'Created',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            {formatDate(row.original.createdAt, organization?.timezone)}
          </span>
        ),
      },
      {
        id: 'qr',
        header: 'QR',
        enableSorting: false,
        cell: ({ row }) => (
          <a
            href={row.original.qrCodeUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
          >
            <QrCode className="h-4 w-4" aria-hidden="true" />
            Open
            <span className="sr-only"> QR code for {row.original.label ?? row.original.code}</span>
          </a>
        ),
      },
    ],
    [organization?.timezone],
  );

  return (
    <>
      <DataTable
        caption="Tracking links"
      columns={columns}
      data={links.data?.items ?? []}
      pageIndex={pageIndex}
      pageSize={pageSize}
      total={links.data?.total ?? 0}
      onPageChange={setPageIndex}
      sorting={sorting}
      onSortingChange={setSorting}
      isLoading={links.loading}
      toolbar={
        <>
          {campaignId ? null : (
            <div className="space-y-1.5">
              <Label htmlFor="tracking-link-campaign" className="text-xs text-muted-foreground">
                Campaign
              </Label>
              <Select value={campaignFilter} onValueChange={setCampaignFilter}>
                <SelectTrigger id="tracking-link-campaign" className="w-56">
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
          )}
          {canWrite ? (
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              New tracking link
            </Button>
          ) : null}
        </>
      }
        emptyState={
          <EmptyState
            icon={<QrCode className="h-5 w-5" />}
            title="No tracking links yet"
            description="Create a tracking link for a campaign and creator to start recording clicks."
            action={
              canWrite ? (
                <Button size="sm" onClick={() => setDialogOpen(true)}>
                  New tracking link
                </Button>
              ) : null
            }
          />
        }
      />
      <NewTrackingLinkDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        campaignId={campaignId}
        onCreated={() => void links.reload()}
      />
    </>
  );
}
