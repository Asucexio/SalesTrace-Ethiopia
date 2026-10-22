'use client';

import * as React from 'react';
import {
  Coins,
  MousePointerClick,
  PackageCheck,
  Receipt,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react';

import { api } from '@/lib/api';
import { formatCount, formatMoney, formatPercent, formatRate } from '@/lib/format';
import { useApiResource } from '@/lib/use-api-resource';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { ErrorState } from '@/components/shared/error-state';
import { InfoTooltip } from '@/components/shared/info-tooltip';

export function CampaignPerformanceTab({ campaignId }: { campaignId: string }) {
  const performance = useApiResource(() => api.campaigns.performance(campaignId), [campaignId]);
  const metrics = performance.data;

  if (performance.loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-[104px] w-full" />
        ))}
      </div>
    );
  }

  if (performance.error) {
    return <ErrorState error={performance.error} onRetry={() => void performance.reload()} />;
  }

  if (!metrics) {
    return (
      <ErrorState
        title="No performance data"
        error="The API did not return performance metrics for this campaign yet."
      />
    );
  }

  const currency = metrics.currency || 'ETB';

  return (
    <div className="space-y-6">
      <section aria-label="Campaign performance metrics">
        <h2 className="sr-only">Campaign performance metrics</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total clicks"
            value={formatCount(metrics.totalClicks)}
            icon={<MousePointerClick className="h-4 w-4" />}
          />
          <StatCard
            label="Eligible clicks"
            value={formatCount(metrics.eligibleClicks)}
            icon={<Target className="h-4 w-4" />}
            hint="The denominator of the conversion rate."
          />
          <StatCard
            label="Attributed orders"
            value={formatCount(metrics.attributedOrders)}
            icon={<PackageCheck className="h-4 w-4" />}
            hint="Includes cancelled and pending orders that still carry a decision."
          />
          <StatCard
            label="Attributed valid orders"
            value={formatCount(metrics.attributedValidOrders)}
            icon={<PackageCheck className="h-4 w-4" />}
            hint="Attributed orders that represent a completed sale."
          />
          <StatCard
            label="Attributed revenue"
            value={formatMoney(metrics.netAttributedRevenue, currency)}
            icon={<Wallet className="h-4 w-4" />}
            hint="Net attributed revenue — collected money minus recorded refunds."
          />
          <StatCard
            label="Campaign cost"
            value={formatMoney(metrics.campaignCost, currency)}
            icon={<Coins className="h-4 w-4" />}
          />
          <StatCard
            label="ROAS"
            labelSuffix={
              <InfoTooltip label="What ROAS means">
                Attributed net revenue ÷ campaign cost. Not ROI.
              </InfoTooltip>
            }
            value={formatRate(metrics.roas)}
            icon={<TrendingUp className="h-4 w-4" />}
            hint="Attributed net revenue ÷ campaign cost. Not ROI."
          />
          <StatCard
            label="Conversion rate"
            value={formatPercent(metrics.conversionRate)}
            icon={<Receipt className="h-4 w-4" />}
          />
          <StatCard
            label="Cost per attributed order"
            value={formatMoney(metrics.costPerAttributedOrder, currency)}
            icon={<Receipt className="h-4 w-4" />}
          />
          <StatCard
            label="Cancelled orders"
            value={formatCount(metrics.cancelledOrders)}
            icon={<PackageCheck className="h-4 w-4" />}
            hint="Contribute zero revenue but stay visible in the order list."
          />
          <StatCard
            label="Refunded orders"
            value={formatCount(metrics.refundedOrders)}
            icon={<PackageCheck className="h-4 w-4" />}
          />
          <StatCard
            label="Refund amount"
            value={formatMoney(metrics.refundAmount, currency)}
            icon={<Wallet className="h-4 w-4" />}
          />
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reconciliation</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Gross attributed order value
              </dt>
              <dd className="mt-1 text-sm tabular-nums">
                {formatMoney(metrics.grossAttributedOrderValue, currency)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Refund amount
              </dt>
              <dd className="mt-1 text-sm tabular-nums">{formatMoney(metrics.refundAmount, currency)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Net attributed revenue
              </dt>
              <dd className="mt-1 text-sm tabular-nums">
                {formatMoney(metrics.netAttributedRevenue, currency)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Creator cost
              </dt>
              <dd className="mt-1 text-sm tabular-nums">{formatMoney(metrics.creatorCost, currency)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Paid orders
              </dt>
              <dd className="mt-1 text-sm tabular-nums">{formatCount(metrics.paidOrders)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Creators
              </dt>
              <dd className="mt-1 text-sm tabular-nums">{formatCount(metrics.creatorCount)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            Gross minus refunds equals net attributed revenue. Discounts conceded are never added
            back. Attributed revenue is not profit and it is not incremental revenue.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
