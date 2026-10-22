'use client';

import * as React from 'react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { Ticket } from 'lucide-react';

import { api } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
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
import type { CouponCode } from '@salestrace/shared-types';

import { CopyButton } from '@/components/shared/copy-button';
import { NewCouponDialog } from '@/components/tracking/new-coupon-dialog';

export function CouponCodesTable({
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

  const coupons = useApiResource(
    () =>
      api.tracking.coupons({
        campaignId: campaignId ?? (campaignFilter === 'all' ? undefined : campaignFilter),
        limit: pageSize,
        offset: pageIndex * pageSize,
      }),
    [campaignId, campaignFilter, pageIndex, pageSize],
  );

  const columns = React.useMemo<ColumnDef<CouponCode>[]>(
    () => [
      {
        accessorKey: 'code',
        header: 'Code',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{row.original.code}</code>
            <CopyButton value={row.original.code} label="Copy code" size="icon" />
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
        accessorKey: 'discountType',
        header: 'Discount',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.discountType === 'percentage'
              ? `${row.original.discountPercent ?? '—'}%`
              : formatMoney(row.original.discountValue, organization?.currency ?? 'ETB')}
          </span>
        ),
      },
      {
        accessorKey: 'redemptionCount',
        header: 'Redemptions',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.redemptionCount}
            {row.original.maxRedemptions ? ` / ${row.original.maxRedemptions}` : ''}
          </span>
        ),
      },
      {
        accessorKey: 'validUntil',
        header: 'Valid until',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            {row.original.validUntil ? formatDate(row.original.validUntil, organization?.timezone) : '—'}
          </span>
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
    ],
    [organization?.currency, organization?.timezone],
  );

  return (
    <>
      <DataTable
        caption="Coupon codes"
      columns={columns}
      data={coupons.data?.items ?? []}
      pageIndex={pageIndex}
      pageSize={pageSize}
      total={coupons.data?.total ?? 0}
      onPageChange={setPageIndex}
      sorting={sorting}
      onSortingChange={setSorting}
      isLoading={coupons.loading}
      toolbar={
        <>
          {campaignId ? null : (
            <div className="space-y-1.5">
              <Label htmlFor="coupon-campaign" className="text-xs text-muted-foreground">
                Campaign
              </Label>
              <Select value={campaignFilter} onValueChange={setCampaignFilter}>
                <SelectTrigger id="coupon-campaign" className="w-56">
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
              New coupon code
            </Button>
          ) : null}
        </>
      }
      emptyState={
        <EmptyState
          icon={<Ticket className="h-5 w-5" />}
          title="No coupon codes yet"
          description="Coupon codes are a creator signal: an order that uses one can be attributed even without a click."
          action={
            canWrite ? (
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                New coupon code
              </Button>
            ) : null
          }
        />
      }
      />
      <NewCouponDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        campaignId={campaignId}
        onCreated={() => void coupons.reload()}
      />
    </>
  );
}
