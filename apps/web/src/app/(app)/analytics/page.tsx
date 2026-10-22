'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { BarChart3, Coins, PackageCheck, Target, TrendingUp, Wallet } from 'lucide-react';

import { api } from '@/lib/api';
import { defaultDateRange, toApiRange, type DateRange } from '@/lib/date-range';
import {
  formatCount,
  formatMoney,
  formatPercent,
  formatRate,
  EM_DASH,
} from '@/lib/format';
import { useApiResource } from '@/lib/use-api-resource';
import { useSession } from '@/lib/session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ATTRIBUTION_METHODS } from '@salestrace/shared-types';
import type { CampaignPerformance, CreatorPerformance } from '@salestrace/shared-types';

import { TimeSeriesChart } from '@/components/charts/time-series-chart';
import { DateRangeFilter } from '@/components/shared/date-range-filter';
import { ErrorState } from '@/components/shared/error-state';
import { InfoTooltip } from '@/components/shared/info-tooltip';
import { CampaignStatusBadge } from '@/components/shared/status-badges';

const ALL = 'all';

export default function AnalyticsPage() {
  const { organization } = useSession();
  const currency = organization?.currency ?? 'ETB';

  const [range, setRange] = React.useState<DateRange>(() => defaultDateRange(30));
  const [campaignId, setCampaignId] = React.useState(ALL);
  const [creatorId, setCreatorId] = React.useState(ALL);
  const [method, setMethod] = React.useState(ALL);

  const apiRange = React.useMemo(() => toApiRange(range), [range]);
  const query = React.useMemo(
    () => ({
      ...apiRange,
      campaignId: campaignId === ALL ? undefined : campaignId,
      creatorId: creatorId === ALL ? undefined : creatorId,
      method: method === ALL ? undefined : method,
      limit: 100,
    }),
    [apiRange, campaignId, creatorId, method],
  );

  const campaigns = useApiResource(() => api.campaigns.list({ limit: 100 }), []);
  const creators = useApiResource(() => api.creators.list({ limit: 100 }), []);

  const overview = useApiResource(() => api.analytics.overview(query), [
    apiRange.from,
    apiRange.to,
    campaignId,
    creatorId,
    method,
  ]);
  const campaignRows = useApiResource(() => api.analytics.campaigns(query), [
    apiRange.from,
    apiRange.to,
    campaignId,
    creatorId,
    method,
  ]);
  const creatorRows = useApiResource(() => api.analytics.creators(query), [
    apiRange.from,
    apiRange.to,
    campaignId,
    creatorId,
    method,
  ]);
  const series = useApiResource(() => api.analytics.timeseries(query), [
    apiRange.from,
    apiRange.to,
    campaignId,
    creatorId,
    method,
  ]);

  const metrics = overview.data?.metrics;

  const campaignColumns = React.useMemo<ColumnDef<CampaignPerformance>[]>(
    () => [
      {
        accessorKey: 'campaignName',
        header: 'Campaign',
        enableSorting: false,
        cell: ({ row }) => <span className="font-medium">{row.original.campaignName}</span>,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        enableSorting: false,
        cell: ({ row }) => <CampaignStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'eligibleClicks',
        header: 'Eligible clicks',
        enableSorting: false,
        cell: ({ row }) => <span className="tabular-nums">{formatCount(row.original.eligibleClicks)}</span>,
      },
      {
        accessorKey: 'attributedValidOrders',
        header: 'Attributed valid orders',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="tabular-nums">{formatCount(row.original.attributedValidOrders)}</span>
        ),
      },
      {
        accessorKey: 'netAttributedRevenue',
        header: 'Attributed revenue',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatMoney(row.original.netAttributedRevenue, row.original.currency || currency)}
          </span>
        ),
      },
      {
        accessorKey: 'campaignCost',
        header: 'Campaign cost',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatMoney(row.original.campaignCost, row.original.currency || currency)}
          </span>
        ),
      },
      {
        accessorKey: 'conversionRate',
        header: 'Conversion rate',
        enableSorting: false,
        cell: ({ row }) => <span className="tabular-nums">{formatPercent(row.original.conversionRate)}</span>,
      },
      {
        accessorKey: 'roas',
        header: 'ROAS',
        enableSorting: false,
        cell: ({ row }) => <span className="tabular-nums">{formatRate(row.original.roas)}</span>,
      },
    ],
    [currency],
  );

  const creatorColumns = React.useMemo<ColumnDef<CreatorPerformance>[]>(
    () => [
      {
        accessorKey: 'creatorName',
        header: 'Creator',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="min-w-[150px]">
            <p className="font-medium">{row.original.creatorName}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {row.original.creatorInternalCode}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'platform',
        header: 'Platform',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-sm capitalize text-muted-foreground">
            {row.original.platform ?? EM_DASH}
          </span>
        ),
      },
      {
        accessorKey: 'campaignCount',
        header: 'Campaigns',
        enableSorting: false,
        cell: ({ row }) => <span className="tabular-nums">{row.original.campaignCount}</span>,
      },
      {
        accessorKey: 'eligibleClicks',
        header: 'Eligible clicks',
        enableSorting: false,
        cell: ({ row }) => <span className="tabular-nums">{formatCount(row.original.eligibleClicks)}</span>,
      },
      {
        accessorKey: 'attributedValidOrders',
        header: 'Attributed valid orders',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="tabular-nums">{formatCount(row.original.attributedValidOrders)}</span>
        ),
      },
      {
        accessorKey: 'netAttributedRevenue',
        header: 'Attributed revenue',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="tabular-nums">{formatMoney(row.original.netAttributedRevenue, currency)}</span>
        ),
      },
      {
        accessorKey: 'creatorCost',
        header: 'Creator cost',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="tabular-nums">{formatMoney(row.original.creatorCost, currency)}</span>
        ),
      },
      {
        accessorKey: 'conversionRate',
        header: 'Conversion rate',
        enableSorting: false,
        cell: ({ row }) => <span className="tabular-nums">{formatPercent(row.original.conversionRate)}</span>,
      },
      {
        accessorKey: 'roas',
        header: 'ROAS',
        enableSorting: false,
        cell: ({ row }) => <span className="tabular-nums">{formatRate(row.original.roas)}</span>,
      },
      {
        accessorKey: 'costPerAttributedOrder',
        header: 'Cost per attributed order',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="tabular-nums">{formatMoney(row.original.costPerAttributedOrder, currency)}</span>
        ),
      },
    ],
    [currency],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Compare campaigns and creators over the selected period. Clicks and orders are filtered on their own timestamps."
      />

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <DateRangeFilter value={range} onChange={setRange} idPrefix="analytics-range" />

            <div className="space-y-1.5">
              <Label htmlFor="analytics-campaign" className="text-xs text-muted-foreground">
                Campaign
              </Label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger id="analytics-campaign" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All campaigns</SelectItem>
                  {(campaigns.data?.items ?? []).map((campaign) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="analytics-creator" className="text-xs text-muted-foreground">
                Creator
              </Label>
              <Select value={creatorId} onValueChange={setCreatorId}>
                <SelectTrigger id="analytics-creator" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All creators</SelectItem>
                  {(creators.data?.items ?? []).map((creator) => (
                    <SelectItem key={creator.id} value={creator.id}>
                      {creator.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="analytics-method" className="text-xs text-muted-foreground">
                Attribution method
              </Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger id="analytics-method" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All methods</SelectItem>
                  {ATTRIBUTION_METHODS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {overview.error ? <ErrorState error={overview.error} onRetry={() => void overview.reload()} /> : null}

      <section aria-label="Key performance indicators">
        <h2 className="sr-only">Key performance indicators</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {overview.loading && !metrics ? (
            Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-[104px] w-full" />
            ))
          ) : (
            <>
              <StatCard
                label="Total clicks"
                value={formatCount(metrics?.totalClicks ?? null)}
                icon={<Target className="h-4 w-4" />}
              />
              <StatCard
                label="Eligible clicks"
                value={formatCount(metrics?.eligibleClicks ?? null)}
                icon={<Target className="h-4 w-4" />}
              />
              <StatCard
                label="Attributed valid orders"
                value={formatCount(metrics?.attributedValidOrders ?? null)}
                icon={<PackageCheck className="h-4 w-4" />}
              />
              <StatCard
                label="Attributed revenue"
                value={formatMoney(metrics?.netAttributedRevenue ?? null, currency)}
                icon={<Wallet className="h-4 w-4" />}
              />
              <StatCard
                label="Campaign cost"
                value={formatMoney(metrics?.campaignCost ?? null, currency)}
                icon={<Coins className="h-4 w-4" />}
              />
              <StatCard
                label="ROAS"
                labelSuffix={
                  <InfoTooltip label="What ROAS means">
                    Attributed net revenue ÷ campaign cost. Not ROI.
                  </InfoTooltip>
                }
                value={formatRate(metrics?.roas ?? null)}
                icon={<TrendingUp className="h-4 w-4" />}
                hint="Attributed net revenue ÷ campaign cost. Not ROI."
              />
              <StatCard
                label="Conversion rate"
                value={formatPercent(metrics?.conversionRate ?? null)}
                icon={<BarChart3 className="h-4 w-4" />}
              />
              <StatCard
                label="Conflicted attributions"
                value={formatCount(metrics?.conflictedAttributions ?? null)}
                icon={<BarChart3 className="h-4 w-4" />}
                hint="Orders where a click and a coupon pointed at different creators."
              />
            </>
          )}
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily clicks and attributed revenue</CardTitle>
        </CardHeader>
        <CardContent>
          {series.loading ? (
            <Skeleton className="h-64 w-full" />
          ) : series.error ? (
            <ErrorState error={series.error} onRetry={() => void series.reload()} />
          ) : series.data && series.data.items.length > 0 ? (
            <TimeSeriesChart points={series.data.items} currency={currency} />
          ) : (
            <EmptyState
              icon={<BarChart3 className="h-5 w-5" />}
              title="No activity in this period"
              description="Widen the date range or clear the filters to see a time series."
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campaign comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            caption="Campaign performance for the selected period"
            columns={campaignColumns}
            data={campaignRows.data?.items ?? []}
            pageIndex={0}
            pageSize={Math.max(1, campaignRows.data?.items.length ?? 1)}
            total={campaignRows.data?.total ?? 0}
            onPageChange={() => undefined}
            sorting={[]}
            onSortingChange={() => undefined}
            isLoading={campaignRows.loading}
            emptyState={
              <EmptyState
                icon={<Target className="h-5 w-5" />}
                title="No campaign data in this period"
                description="Try widening the date range or clearing the filters."
              />
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Creator comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            caption="Creator performance for the selected period"
            columns={creatorColumns}
            data={creatorRows.data?.items ?? []}
            pageIndex={0}
            pageSize={Math.max(1, creatorRows.data?.items.length ?? 1)}
            total={creatorRows.data?.total ?? 0}
            onPageChange={() => undefined}
            sorting={[]}
            onSortingChange={() => undefined}
            isLoading={creatorRows.loading}
            emptyState={
              <EmptyState
                icon={<Target className="h-5 w-5" />}
                title="No creator data in this period"
                description="Try widening the date range or clearing the filters."
              />
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
