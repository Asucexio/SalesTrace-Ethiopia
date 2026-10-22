'use client';

import * as React from 'react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { Receipt } from 'lucide-react';

import { api } from '@/lib/api';
import { formatDateTime, formatMoney, EM_DASH } from '@/lib/format';
import { useApiResource } from '@/lib/use-api-resource';
import { useSession } from '@/lib/session';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import type { Order } from '@salestrace/shared-types';

import { OrderStatusBadge } from '@/components/shared/status-badges';

export function CampaignOrdersTab({ campaignId }: { campaignId: string }) {
  const { organization } = useSession();
  const [pageIndex, setPageIndex] = React.useState(0);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const pageSize = 25;

  const orders = useApiResource(
    () => api.campaigns.orders(campaignId, { limit: pageSize, offset: pageIndex * pageSize }),
    [campaignId, pageIndex],
  );

  const columns = React.useMemo<ColumnDef<Order>[]>(
    () => [
      {
        accessorKey: 'externalOrderId',
        header: 'Order',
        enableSorting: false,
        cell: ({ row }) => <span className="font-medium">{row.original.externalOrderId}</span>,
      },
      {
        accessorKey: 'orderedAt',
        header: 'Ordered',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            {formatDateTime(row.original.orderedAt, organization?.timezone)}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        enableSorting: false,
        cell: ({ row }) => <OrderStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'attribution',
        header: 'Creator',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.attribution?.creatorName ?? EM_DASH}
          </span>
        ),
      },
      {
        accessorKey: 'totalPaid',
        header: 'Total paid',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-right tabular-nums">
            {formatMoney(row.original.totalPaid, row.original.currency)}
          </span>
        ),
      },
      {
        accessorKey: 'netRevenue',
        header: 'Net revenue',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-right tabular-nums">
            {formatMoney(row.original.netRevenue, row.original.currency)}
          </span>
        ),
      },
    ],
    [organization?.timezone],
  );

  return (
    <DataTable
      caption={`Orders attributed to this campaign`}
      columns={columns}
      data={orders.data?.items ?? []}
      pageIndex={pageIndex}
      pageSize={pageSize}
      total={orders.data?.total ?? 0}
      onPageChange={setPageIndex}
      sorting={sorting}
      onSortingChange={setSorting}
      isLoading={orders.loading}
      emptyState={
        <EmptyState
          icon={<Receipt className="h-5 w-5" />}
          title="No orders attributed yet"
          description="Import your order export and run attribution to see orders matched to this campaign."
        />
      }
    />
  );
}
