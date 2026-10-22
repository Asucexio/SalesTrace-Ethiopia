'use client';

import * as React from 'react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { GitBranch } from 'lucide-react';

import { api } from '@/lib/api';
import { formatDateTime, EM_DASH } from '@/lib/format';
import { useApiResource } from '@/lib/use-api-resource';
import { useSession } from '@/lib/session';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import type { Attribution } from '@salestrace/shared-types';

import { AttributionMethodBadge, AttributionReasonBadge } from '@/components/shared/status-badges';

export function CampaignAttributionsTab({ campaignId }: { campaignId: string }) {
  const { organization } = useSession();
  const [pageIndex, setPageIndex] = React.useState(0);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const pageSize = 25;

  const attributions = useApiResource(
    () => api.campaigns.attributions(campaignId, { limit: pageSize, offset: pageIndex * pageSize }),
    [campaignId, pageIndex],
  );

  const columns = React.useMemo<ColumnDef<Attribution>[]>(
    () => [
      {
        accessorKey: 'externalOrderId',
        header: 'Order',
        enableSorting: false,
        cell: ({ row }) => <span className="font-medium">{row.original.externalOrderId ?? EM_DASH}</span>,
      },
      {
        accessorKey: 'creatorName',
        header: 'Creator',
        enableSorting: false,
        cell: ({ row }) => <span className="text-sm">{row.original.creatorName ?? EM_DASH}</span>,
      },
      {
        accessorKey: 'method',
        header: 'Method',
        enableSorting: false,
        cell: ({ row }) => <AttributionMethodBadge method={row.original.method} />,
      },
      {
        accessorKey: 'decisionReason',
        header: 'Reason',
        enableSorting: false,
        cell: ({ row }) => <AttributionReasonBadge reason={row.original.decisionReason} />,
      },
      {
        accessorKey: 'conflictFlag',
        header: 'Conflict',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.conflictFlag ? (
            <Badge variant="warning">Conflict</Badge>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: 'isValidSale',
        header: 'Valid sale',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.isValidSale ? 'Yes' : 'No'}</span>
        ),
      },
      {
        accessorKey: 'attributedAt',
        header: 'Attributed',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            {formatDateTime(row.original.attributedAt, organization?.timezone)}
          </span>
        ),
      },
    ],
    [organization?.timezone],
  );

  return (
    <DataTable
      caption="Attribution decisions for this campaign"
      columns={columns}
      data={attributions.data?.items ?? []}
      pageIndex={pageIndex}
      pageSize={pageSize}
      total={attributions.data?.total ?? 0}
      onPageChange={setPageIndex}
      sorting={sorting}
      onSortingChange={setSorting}
      isLoading={attributions.loading}
      emptyState={
        <EmptyState
          icon={<GitBranch className="h-5 w-5" />}
          title="No attribution decisions yet"
          description="Attribution is computed on import. Import your orders to see the decisions and their reasons."
        />
      }
    />
  );
}
