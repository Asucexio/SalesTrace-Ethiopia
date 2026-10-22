'use client';

import * as React from 'react';
import Link from 'next/link';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { Receipt, Upload } from 'lucide-react';

import { api } from '@/lib/api';
import { endOfDayExclusive, startOfDay } from '@/lib/date-range';
import { formatDateTime, formatMoney, EM_DASH } from '@/lib/format';
import { useApiResource } from '@/lib/use-api-resource';
import { useSession } from '@/lib/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ORDER_STATUSES } from '@salestrace/shared-types';
import type { Order } from '@salestrace/shared-types';

import { OrderStatusBadge } from '@/components/shared/status-badges';

const PAGE_SIZE = 25;

export default function OrdersPage() {
  const { organization, role } = useSession();
  const currency = organization?.currency ?? 'ETB';
  const canWrite = role === 'owner' || role === 'admin' || role === 'marketer';

  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('all');
  const [attributed, setAttributed] = React.useState('all');
  const [campaignId, setCampaignId] = React.useState('all');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [pageIndex, setPageIndex] = React.useState(0);
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'orderedAt', desc: true }]);

  const sort = React.useMemo(() => {
    const first = sorting[0];
    if (!first) return '-orderedAt';
    return first.desc ? `-${first.id}` : first.id;
  }, [sorting]);

  const campaigns = useApiResource(() => api.campaigns.list({ limit: 100 }), []);

  const orders = useApiResource(
    () =>
      api.orders.list({
        search: search || undefined,
        status: status === 'all' ? undefined : status,
        attributed: attributed === 'all' ? undefined : attributed === 'true',
        campaignId: campaignId === 'all' ? undefined : campaignId,
        from: from ? startOfDay(from) : undefined,
        to: to ? endOfDayExclusive(to) : undefined,
        limit: PAGE_SIZE,
        offset: pageIndex * PAGE_SIZE,
        sort,
      }),
    [search, status, attributed, campaignId, from, to, pageIndex, sort],
  );

  React.useEffect(() => {
    setPageIndex(0);
  }, [search, status, attributed, campaignId, from, to]);

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
        enableSorting: true,
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
        header: 'Attribution',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.attribution ? (
            <div className="text-sm">
              <p className="font-medium">{row.original.attribution.creatorName ?? 'Creator'}</p>
              <p className="text-xs text-muted-foreground">
                {row.original.attribution.method} · {row.original.attribution.decisionReason}
              </p>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">Not attributed</span>
          ),
      },
      {
        accessorKey: 'couponCode',
        header: 'Coupon',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.couponCode ? (
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              {row.original.couponCode}
            </code>
          ) : (
            <span className="text-muted-foreground">{EM_DASH}</span>
          ),
      },
      {
        accessorKey: 'totalPaid',
        header: 'Total paid',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-right tabular-nums">
            {formatMoney(row.original.totalPaid, row.original.currency || currency)}
          </span>
        ),
      },
      {
        accessorKey: 'netRevenue',
        header: 'Net revenue',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-right tabular-nums">
            {formatMoney(row.original.netRevenue, row.original.currency || currency)}
          </span>
        ),
      },
      {
        accessorKey: 'isValidSale',
        header: 'Valid sale',
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.isValidSale ? 'success' : 'muted'}>
            {row.original.isValidSale ? 'Yes' : 'No'}
          </Badge>
        ),
      },
    ],
    [currency, organization?.timezone],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description="Imported orders and the attribution decision recorded for each one."
        actions={
          canWrite ? (
            <Button asChild>
              <Link href="/orders/import">
                <Upload aria-hidden="true" />
                Import orders
              </Link>
            </Button>
          ) : null
        }
      />

      <DataTable
        caption="Imported orders"
        columns={columns}
        data={orders.data?.items ?? []}
        pageIndex={pageIndex}
        pageSize={PAGE_SIZE}
        total={orders.data?.total ?? 0}
        onPageChange={setPageIndex}
        sorting={sorting}
        onSortingChange={setSorting}
        isLoading={orders.loading}
        toolbar={
          <>
            <div className="space-y-1.5">
              <Label htmlFor="order-search" className="text-xs text-muted-foreground">
                Search
              </Label>
              <Input
                id="order-search"
                className="w-56"
                placeholder="Order id or coupon"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="order-status" className="text-xs text-muted-foreground">
                Status
              </Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="order-status" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {ORDER_STATUSES.map((value) => (
                    <SelectItem key={value} value={value} className="capitalize">
                      {value.replace('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="order-attributed" className="text-xs text-muted-foreground">
                Attribution
              </Label>
              <Select value={attributed} onValueChange={setAttributed}>
                <SelectTrigger id="order-attributed" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All orders</SelectItem>
                  <SelectItem value="true">Attributed</SelectItem>
                  <SelectItem value="false">Not attributed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="order-campaign" className="text-xs text-muted-foreground">
                Campaign
              </Label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger id="order-campaign" className="w-56">
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

            <div className="space-y-1.5">
              <Label htmlFor="order-from" className="text-xs text-muted-foreground">
                From
              </Label>
              <Input
                id="order-from"
                type="date"
                className="w-40"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="order-to" className="text-xs text-muted-foreground">
                To
              </Label>
              <Input
                id="order-to"
                type="date"
                className="w-40"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
          </>
        }
        emptyState={
          <EmptyState
            icon={<Receipt className="h-5 w-5" />}
            title={search || status !== 'all' ? 'No orders match these filters' : 'No orders yet'}
            description={
              search || status !== 'all'
                ? 'Try clearing the filters.'
                : 'Import your order export as a CSV to start attributing revenue.'
            }
            action={
              canWrite && !search && status === 'all' ? (
                <Button asChild size="sm">
                  <Link href="/orders/import">Import orders</Link>
                </Button>
              ) : null
            }
          />
        }
      />
    </div>
  );
}
