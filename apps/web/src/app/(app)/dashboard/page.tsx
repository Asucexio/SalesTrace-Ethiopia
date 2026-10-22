'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  BarChart3,
  Coins,
  MousePointerClick,
  PackageCheck,
  Receipt,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react';

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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DateRangeFilter } from '@/components/shared/date-range-filter';
import { ErrorState } from '@/components/shared/error-state';
import { InfoTooltip } from '@/components/shared/info-tooltip';
import { CampaignStatusBadge, OrderStatusBadge } from '@/components/shared/status-badges';

export default function DashboardPage() {
  const { organization } = useSession();
  const [range, setRange] = React.useState<DateRange>(() => defaultDateRange(30));

  const apiRange = React.useMemo(() => toApiRange(range), [range]);
  const currency = organization?.currency ?? 'ETB';

  const overview = useApiResource(() => api.analytics.overview(apiRange), [apiRange.from, apiRange.to]);
  const campaigns = useApiResource(
    () => api.analytics.campaigns({ ...apiRange, limit: 10 }),
    [apiRange.from, apiRange.to],
  );
  const recentOrders = useApiResource(
    () => api.orders.list({ limit: 8, sort: '-orderedAt' }),
    [],
  );

  const metrics = overview.data?.metrics;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Campaign performance for the selected period. Clicks and orders are filtered on their own timestamps."
        actions={
          <DateRangeFilter value={range} onChange={setRange} idPrefix="dashboard-range" />
        }
      />

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
                icon={<MousePointerClick className="h-4 w-4" />}
                hint="Every tracked click in the period, including clicks that cannot be attributed."
              />
              <StatCard
                label="Eligible clicks"
                value={formatCount(metrics?.eligibleClicks ?? null)}
                icon={<Target className="h-4 w-4" />}
                hint="Clicks that satisfy the attribution rules. The denominator of the conversion rate."
              />
              <StatCard
                label="Attributed valid orders"
                value={formatCount(metrics?.attributedValidOrders ?? null)}
                icon={<PackageCheck className="h-4 w-4" />}
                hint="Attributed orders that represent a completed sale (paid, partially refunded or refunded)."
              />
              <StatCard
                label="Attributed revenue"
                value={formatMoney(metrics?.netAttributedRevenue ?? null, currency)}
                icon={<Wallet className="h-4 w-4" />}
                hint="Net attributed revenue — collected money minus recorded refunds. Not profit."
              />
              <StatCard
                label="Campaign cost"
                value={formatMoney(metrics?.campaignCost ?? null, currency)}
                icon={<Coins className="h-4 w-4" />}
                hint="All recorded campaign costs in the period."
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
                hint="Attributed valid orders ÷ eligible clicks × 100. Shown as — when there were no eligible clicks."
              />
              <StatCard
                label="Cost per attributed order"
                value={formatMoney(metrics?.costPerAttributedOrder ?? null, currency)}
                icon={<Receipt className="h-4 w-4" />}
                hint="Campaign cost ÷ attributed valid orders. Shown as — when there were no attributed valid orders."
              />
            </>
          )}
        </div>
      </section>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Campaign performance</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/analytics">Open analytics</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {campaigns.error ? (
            <ErrorState error={campaigns.error} onRetry={() => void campaigns.reload()} />
          ) : campaigns.loading ? (
            <Skeleton className="h-64 w-full" />
          ) : campaigns.data && campaigns.data.items.length > 0 ? (
            <Table>
              <caption className="sr-only">
                Campaign performance for the selected period
              </caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Campaign</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col" className="text-right">Eligible clicks</TableHead>
                  <TableHead scope="col" className="text-right">Attributed valid orders</TableHead>
                  <TableHead scope="col" className="text-right">Attributed revenue</TableHead>
                  <TableHead scope="col" className="text-right">Campaign cost</TableHead>
                  <TableHead scope="col" className="text-right">ROAS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.data.items.map((row) => (
                  <TableRow key={row.campaignId}>
                    <TableCell>
                      <Link
                        href={`/campaigns/${row.campaignId}`}
                        className="font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {row.campaignName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <CampaignStatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCount(row.eligibleClicks)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCount(row.attributedValidOrders)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(row.netAttributedRevenue, row.currency || currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(row.campaignCost, row.currency || currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRate(row.roas)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={<TrendingUp className="h-5 w-5" />}
              title="No campaign performance yet"
              description="Create a campaign and assign creators to start tracking attributed revenue."
              action={
                <Button asChild size="sm">
                  <Link href="/campaigns/new">Create a campaign</Link>
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Recent orders</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/orders">All orders</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentOrders.error ? (
            <ErrorState error={recentOrders.error} onRetry={() => void recentOrders.reload()} />
          ) : recentOrders.loading ? (
            <Skeleton className="h-56 w-full" />
          ) : recentOrders.data && recentOrders.data.items.length > 0 ? (
            <Table>
              <caption className="sr-only">The most recent imported orders</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Order</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col">Attribution</TableHead>
                  <TableHead scope="col" className="text-right">Net revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentOrders.data.items.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.externalOrderId}</TableCell>
                    <TableCell>
                      <OrderStatusBadge status={order.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {order.attribution ? `${order.attribution.creatorName ?? 'Creator'} · ${order.attribution.method}` : EM_DASH}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(order.netRevenue, order.currency || currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={<Receipt className="h-5 w-5" />}
              title="No orders imported yet"
              description="Import your order export as a CSV to start attributing revenue to creators."
              action={
                <Button asChild size="sm">
                  <Link href="/orders/import">Import orders</Link>
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
