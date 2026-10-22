'use client';

import * as React from 'react';
import Link from 'next/link';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { Plus, Search, Users } from 'lucide-react';

import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
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
import type { Creator } from '@salestrace/shared-types';

const PAGE_SIZE = 25;
const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'facebook', 'telegram', 'x', 'linkedin'];

export default function CreatorsPage() {
  const { organization, role } = useSession();
  const canWrite = role === 'owner' || role === 'admin' || role === 'marketer';

  const [search, setSearch] = React.useState('');
  const [platform, setPlatform] = React.useState('all');
  const [pageIndex, setPageIndex] = React.useState(0);
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'displayName', desc: false }]);

  const sort = React.useMemo(() => {
    const first = sorting[0];
    if (!first) return 'displayName';
    return first.desc ? `-${first.id}` : first.id;
  }, [sorting]);

  const creators = useApiResource(
    () =>
      api.creators.list({
        search: search || undefined,
        platform: platform === 'all' ? undefined : platform,
        limit: PAGE_SIZE,
        offset: pageIndex * PAGE_SIZE,
        sort,
      }),
    [search, platform, pageIndex, sort],
  );

  React.useEffect(() => {
    setPageIndex(0);
  }, [search, platform]);

  const columns = React.useMemo<ColumnDef<Creator>[]>(
    () => [
      {
        accessorKey: 'displayName',
        header: 'Creator',
        enableSorting: true,
        cell: ({ row }) => (
          <div className="min-w-[180px]">
            <Link
              href={`/creators/${row.original.id}`}
              className="font-medium underline-offset-4 hover:underline"
            >
              {row.original.displayName}
            </Link>
            <p className="font-mono text-xs text-muted-foreground">{row.original.internalCode}</p>
          </div>
        ),
      },
      {
        accessorKey: 'platform',
        header: 'Platform',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.platform ? (
            <Badge variant="outline" className="capitalize">
              {row.original.platform}
            </Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: 'niche',
        header: 'Niche',
        enableSorting: false,
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.niche ?? '—'}</span>,
      },
      {
        accessorKey: 'audienceLocation',
        header: 'Audience location',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.audienceLocation ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'campaignCount',
        header: 'Campaigns',
        enableSorting: false,
        cell: ({ row }) => <span className="tabular-nums">{row.original.campaignCount ?? 0}</span>,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.status === 'active' ? 'success' : 'muted'}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: 'Added',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            {formatDate(row.original.createdAt, organization?.timezone)}
          </span>
        ),
      },
    ],
    [organization?.timezone],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Creators"
        description="Every creator in this workspace, with the campaigns they have worked on."
        actions={
          canWrite ? (
            <Button asChild>
              <Link href="/creators/new">
                <Plus aria-hidden="true" />
                New creator
              </Link>
            </Button>
          ) : null
        }
      />

      <DataTable
        caption="Creators in this workspace"
        columns={columns}
        data={creators.data?.items ?? []}
        pageIndex={pageIndex}
        pageSize={PAGE_SIZE}
        total={creators.data?.total ?? 0}
        onPageChange={setPageIndex}
        sorting={sorting}
        onSortingChange={setSorting}
        isLoading={creators.loading}
        toolbar={
          <>
            <div className="space-y-1.5">
              <Label htmlFor="creator-search" className="text-xs text-muted-foreground">
                Search
              </Label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="creator-search"
                  className="w-64 pl-8"
                  placeholder="Name or code"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="creator-platform" className="text-xs text-muted-foreground">
                Platform
              </Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger id="creator-platform" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All platforms</SelectItem>
                  {PLATFORMS.map((item) => (
                    <SelectItem key={item} value={item} className="capitalize">
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        }
        emptyState={
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title={search || platform !== 'all' ? 'No creators match these filters' : 'No creators yet'}
            description={
              search || platform !== 'all'
                ? 'Try a different search term or platform.'
                : 'Add the creators you work with before assigning them to a campaign.'
            }
            action={
              canWrite && !search && platform === 'all' ? (
                <Button asChild size="sm">
                  <Link href="/creators/new">Add a creator</Link>
                </Button>
              ) : null
            }
          />
        }
      />
    </div>
  );
}
