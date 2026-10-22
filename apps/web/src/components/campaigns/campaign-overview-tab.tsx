'use client';

import * as React from 'react';
import Link from 'next/link';
import { CalendarDays, ExternalLink, Target, Wallet } from 'lucide-react';

import type { Campaign } from '@salestrace/shared-types';

import { formatDate, formatMoney, EM_DASH } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { CampaignStatusBadge } from '@/components/shared/status-badges';
import { CampaignStatusActions } from '@/components/campaigns/campaign-status-actions';

export function CampaignOverviewTab({
  campaign,
  onChanged,
  canWrite,
}: {
  campaign: Campaign;
  onChanged: () => void;
  canWrite: boolean;
}) {
  const { organization } = useSession();
  const currency = campaign.currency || organization?.currency || 'ETB';

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Creators"
          value={campaign.creatorCount}
          icon={<Target className="h-4 w-4" />}
          hint="Creators assigned to this campaign."
        />
        <StatCard
          label="Campaign cost"
          value={formatMoney(campaign.costTotal, currency)}
          icon={<Wallet className="h-4 w-4" />}
          hint="Sum of every recorded cost for this campaign."
        />
        <StatCard
          label="Attribution window"
          value={`${campaign.attributionWindowDays} days`}
          icon={<CalendarDays className="h-4 w-4" />}
          hint={`Policy version ${campaign.attributionPolicyVersion}.`}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Campaign details</CardTitle>
          <CampaignStatusActions
            campaignId={campaign.id}
            status={campaign.status}
            onChanged={onChanged}
            canWrite={canWrite}
          />
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <Detail label="Status">
              <CampaignStatusBadge status={campaign.status} />
            </Detail>
            <Detail label="Objective">{campaign.objective ?? EM_DASH}</Detail>
            <Detail label="Description">{campaign.description ?? EM_DASH}</Detail>
            <Detail label="Starts">{formatDate(campaign.startAt, organization?.timezone)}</Detail>
            <Detail label="Ends">
              {campaign.endAt ? formatDate(campaign.endAt, organization?.timezone) : 'Open-ended'}
            </Detail>
            <Detail label="Budget">
              {campaign.budget ? formatMoney(campaign.budget, currency) : EM_DASH}
            </Detail>
            <Detail label="Currency">{campaign.currency}</Detail>
            <Detail label="Attribution policy">{campaign.attributionPolicyVersion}</Detail>
            <Detail label="Destination URL">
              {campaign.destinationUrl ? (
                <a
                  href={campaign.destinationUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                >
                  {campaign.destinationUrl}
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              ) : (
                EM_DASH
              )}
            </Detail>
            <Detail label="Created">{formatDate(campaign.createdAt, organization?.timezone)}</Detail>
            <Detail label="Updated">{formatDate(campaign.updatedAt, organization?.timezone)}</Detail>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Next steps</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <Link
              href={`/campaigns/${campaign.id}?tab=creators`}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Assign creators
            </Link>{' '}
            so clicks and coupons can be attributed to them.
          </p>
          <p>
            <Link
              href={`/campaigns/${campaign.id}?tab=tracking`}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Create tracking links
            </Link>{' '}
            and coupon codes to distribute to those creators.
          </p>
          <p>
            <Link
              href={`/campaigns/${campaign.id}?tab=costs`}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Record campaign costs
            </Link>{' '}
            so ROAS and cost per attributed order can be calculated.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm">{children}</dd>
    </div>
  );
}
