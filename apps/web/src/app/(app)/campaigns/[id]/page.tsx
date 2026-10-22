'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { api } from '@/lib/api';
import { useApiResource } from '@/lib/use-api-resource';
import { useSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ErrorState } from '@/components/shared/error-state';
import { CampaignStatusBadge } from '@/components/shared/status-badges';
import { CampaignAttributionsTab } from '@/components/campaigns/campaign-attributions-tab';
import { CampaignCostsTab } from '@/components/campaigns/campaign-costs-tab';
import { CampaignCreatorsTab } from '@/components/campaigns/campaign-creators-tab';
import { CampaignOrdersTab } from '@/components/campaigns/campaign-orders-tab';
import { CampaignOverviewTab } from '@/components/campaigns/campaign-overview-tab';
import { CampaignPerformanceTab } from '@/components/campaigns/campaign-performance-tab';
import { CouponCodesTable } from '@/components/tracking/coupon-codes-table';
import { TrackingLinksTable } from '@/components/tracking/tracking-links-table';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'creators', label: 'Creators' },
  { value: 'tracking', label: 'Tracking assets' },
  { value: 'costs', label: 'Costs' },
  { value: 'performance', label: 'Performance' },
  { value: 'orders', label: 'Orders' },
  { value: 'attributions', label: 'Attributions' },
] as const;

export default function CampaignDetailPage() {
  return (
    <React.Suspense
      fallback={
        <div className="space-y-6">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <CampaignDetailContent />
    </React.Suspense>
  );
}

function CampaignDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { role } = useSession();
  const campaignId = params?.id ?? '';

  const canWrite = role === 'owner' || role === 'admin' || role === 'marketer';
  const tab = searchParams.get('tab') ?? 'overview';

  const campaign = useApiResource(() => api.campaigns.get(campaignId), [campaignId]);

  if (campaign.loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-10 w-full max-w-3xl" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (campaign.error || !campaign.data) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/campaigns">
            <ArrowLeft aria-hidden="true" />
            Back to campaigns
          </Link>
        </Button>
        <ErrorState error={campaign.error ?? 'This campaign could not be loaded.'} onRetry={() => void campaign.reload()} />
      </div>
    );
  }

  const record = campaign.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={record.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <CampaignStatusBadge status={record.status} />
            <span>{record.objective ?? 'No objective recorded.'}</span>
          </span>
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/campaigns">
              <ArrowLeft aria-hidden="true" />
              All campaigns
            </Link>
          </Button>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(value) => router.replace(`/campaigns/${campaignId}?tab=${value}`)}
      >
        <TabsList className="flex-wrap">
          {TABS.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <CampaignOverviewTab
            campaign={record}
            onChanged={() => void campaign.reload()}
            canWrite={canWrite}
          />
        </TabsContent>

        <TabsContent value="creators">
          <CampaignCreatorsTab campaignId={campaignId} canWrite={canWrite} />
        </TabsContent>

        <TabsContent value="tracking">
          <div className="space-y-8">
            <section aria-label="Tracking links">
              <h2 className="mb-3 text-sm font-semibold">Tracking links</h2>
              <TrackingLinksTable campaignId={campaignId} canWrite={canWrite} />
            </section>
            <section aria-label="Coupon codes">
              <h2 className="mb-3 text-sm font-semibold">Coupon codes</h2>
              <CouponCodesTable campaignId={campaignId} canWrite={canWrite} />
            </section>
          </div>
        </TabsContent>

        <TabsContent value="costs">
          <CampaignCostsTab
            campaignId={campaignId}
            currency={record.currency}
            canWrite={canWrite}
          />
        </TabsContent>

        <TabsContent value="performance">
          <CampaignPerformanceTab campaignId={campaignId} />
        </TabsContent>

        <TabsContent value="orders">
          <CampaignOrdersTab campaignId={campaignId} />
        </TabsContent>

        <TabsContent value="attributions">
          <CampaignAttributionsTab campaignId={campaignId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
