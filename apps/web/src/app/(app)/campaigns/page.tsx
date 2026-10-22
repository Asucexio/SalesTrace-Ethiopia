'use client';

import * as React from 'react';
import Link from 'next/link';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { Megaphone, Plus, Search } from 'lucide-react';

import { api } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { useApiResource } from '@/lib/use-api-resource';
import { useSession } from '@/lib/session';
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
import { CampaignStatusBadge } from '@/components/shared/status-badges';

const PAGE_SIZE = 25;

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

export default function CampaignsPage() {
  const { organization, role } = useSession();
  const currency = organization?.currency ?? 'ETB';
  const canWrite = role === 'owner' || role === 'admin' || role === 'marketer';

  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('all');
  const [pageIndex, setPageIndex] = React.useState(0);
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'createdAt', desc: true }]);

  const sort = React.useMemo(() => {
    const first = sorting[0];
    if (!first) return '-createdAt';
    return first.desc ? `-${first.id}` : first.id;
  }, [sorting]);

  const campaigns = useApiResource(
    () =>
      api.campaigns.list({
        search: search || undefined,
        status: status === 'all' ? undefined : status,
        limit: PAGE_SIZE,
        offset: pageIndex * PAGE_SIZE,
        sort,
      }),
    [search, status, pageIndex, sort],
  );

  React.useEffect(() => {
    setPageIndex(0);
  }, [search, status]);

  const columns = React.useMemo<ColumnDef<Awaited<ReturnType<typeof api.campaigns.list>>['items'][number]>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Campaign',
        enableSorting: true,
        cell: ({ row }) => (
          <div className="min-w-[200px]">
            <Link
              href={`/campaigns/${row.original.id}`}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {row.original.name}
            </Link>
            {row.original.objective ? (
              <p className="text-xs text-muted-foreground">{row.original.objective}</p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        enableSorting: false,
        cell: ({ row }) => <CampaignStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'startAt',
        header: 'Runs',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            {formatDate(row.original.startAt, organization?.timezone)} →{' '}
            {row.original.endAt ? formatDate(row.original.endAt, organization?.timezone) : 'open'}
          </span>
        ),
      },
      {
        accessorKey: 'creatorCount',
        header: 'Creators',
        enableSorting: false,
        cell: ({ row }) => <span className="tabular-nums">{row.original.creatorCount}</span>,
      },
      {
        accessorKey: 'costTotal',
        header: 'Cost',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatMoney(row.original.costTotal, row.original.currency || currency)}
          </span>
        ),
      },
    ],
    [currency, organization?.timezone],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        description="Every influencer campaign in this workspace."
        actions={
          canWrite ? (
            <Button asChild>
              <Link href="/campaigns/new">
                <Plus aria-hidden="true" />
                New campaign
              </Link>
            </Button>
          ) : null
        }
      />

      <DataTable
        caption="Campaigns in this workspace"
        columns={columns}
        data={campaigns.data?.items ?? []}
        pageIndex={pageIndex}
        pageSize={PAGE_SIZE}
        total={campaigns.data?.total ?? 0}
        onPageChange={setPageIndex}
        onPageSizeChange={() => undefined}
        sorting={sorting}
        onSortingChange={setSorting}
        isLoading={campaigns.loading}
        toolbar={
          <>
            <div className="space-y-1.5">
              <Label htmlFor="campaign-search" className="text-xs text-muted-foreground">
                Search
              </Label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="campaign-search"
                  className="w-64 pl-8"
                  placeholder="Campaign name"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="campaign-status" className="text-xs text-muted-foreground">
                Status
              </Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="campaign-status" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        }
        emptyState={
          campaigns.error ? null : (
            <EmptyState
              icon={<Megaphone className="h-5 w-5" />}
              title={search || status !== 'all' ? 'No campaigns match these filters' : 'No campaigns yet'}
              description={
                search || status !== 'all'
                  ? 'Try a different search term or status.'
                  : 'Create your first campaign to start tracking attributed revenue.'
              }
              action={
                canWrite && !search && status === 'all' ? (
                  <Button asChild size="sm">
                    <Link href="/campaigns/new">Create a campaign</Link>
                  </Button>
                ) : null
              }
            />
          )
        }
      />
    </div>
  );
}
