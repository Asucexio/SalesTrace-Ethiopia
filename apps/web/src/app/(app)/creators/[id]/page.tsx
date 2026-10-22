'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  BadgeCheck,
  Coins,
  Megaphone,
  PackageCheck,
  Receipt,
  TrendingUp,
  Wallet,
} from 'lucide-react';

import { api } from '@/lib/api';
import { formatCount, formatDate, formatMoney, formatPercent, formatRate } from '@/lib/format';
import { useApiResource } from '@/lib/use-api-resource';
import { useSession } from '@/lib/session';
import { Badge } from '@/components/ui/badge';
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
import { ErrorState } from '@/components/shared/error-state';
import { InfoTooltip } from '@/components/shared/info-tooltip';
import { CampaignStatusBadge } from '@/components/shared/status-badges';

export default function CreatorDetailPage() {
  const params = useParams<{ id: string }>();
  const { organization } = useSession();
  const creatorId = params?.id ?? '';

  const creator = useApiResource(() => api.creators.get(creatorId), [creatorId]);
  const performance = useApiResource(() => api.creators.performance(creatorId), [creatorId]);
  const socialAccounts = useApiResource(() => api.creators.socialAccounts(creatorId), [creatorId]);
  const campaigns = useApiResource(() => api.campaigns.list({ creatorId, limit: 50 }), [creatorId]);

  if (creator.loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-[104px] w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (creator.error || !creator.data) {
    return (
      <div className="space-y-4">
        <ButtonLink href="/creators" label="Back to creators" />
        <ErrorState
          error={creator.error ?? 'This creator could not be loaded.'}
          onRetry={() => void creator.reload()}
        />
      </div>
    );
  }

  const record = creator.data;
  const currency = organization?.currency ?? 'ETB';
  const metrics = performance.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={record.displayName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono">
              {record.internalCode}
            </Badge>
            {record.platform ? (
              <Badge variant="secondary" className="capitalize">
                {record.platform}
              </Badge>
            ) : null}
            <Badge variant={record.status === 'active' ? 'success' : 'muted'}>{record.status}</Badge>
          </span>
        }
        actions={
          <ButtonLink href="/creators" label="All creators" variant="outline" />
        }
      />

      <section aria-label="Creator performance">
        <h2 className="sr-only">Creator performance</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Attributed valid orders"
            value={formatCount(metrics?.attributedValidOrders ?? null)}
            icon={<PackageCheck className="h-4 w-4" />}
          />
          <StatCard
            label="Attributed revenue"
            value={formatMoney(metrics?.netAttributedRevenue ?? null, currency)}
            icon={<Wallet className="h-4 w-4" />}
            hint="Net attributed revenue — collected money minus recorded refunds."
          />
          <StatCard
            label="Creator cost"
            value={formatMoney(metrics?.creatorCost ?? null, currency)}
            icon={<Coins className="h-4 w-4" />}
            hint="Sum of recorded creator fees."
          />
          <StatCard
            label="ROAS"
            labelSuffix={
              <InfoTooltip label="What ROAS means">
                Creator attributed net revenue ÷ creator cost. Not ROI.
              </InfoTooltip>
            }
            value={formatRate(metrics?.roas ?? null)}
            icon={<TrendingUp className="h-4 w-4" />}
            hint="Creator attributed net revenue ÷ creator cost. Not ROI."
          />
          <StatCard
            label="Cost per attributed order"
            value={formatMoney(metrics?.costPerAttributedOrder ?? null, currency)}
            icon={<Receipt className="h-4 w-4" />}
          />
          <StatCard
            label="Conversion rate"
            value={formatPercent(metrics?.conversionRate ?? null)}
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <StatCard
            label="Eligible clicks"
            value={formatCount(metrics?.eligibleClicks ?? null)}
            icon={<Megaphone className="h-4 w-4" />}
          />
          <StatCard
            label="Campaigns"
            value={formatCount(metrics?.campaignCount ?? campaigns.data?.total ?? null)}
            icon={<Megaphone className="h-4 w-4" />}
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Contact email
                </dt>
                <dd className="mt-1 text-sm">{record.contactEmail ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Contact phone
                </dt>
                <dd className="mt-1 text-sm">{record.contactPhone ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Niche
                </dt>
                <dd className="mt-1 text-sm">{record.niche ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Audience location
                </dt>
                <dd className="mt-1 text-sm">{record.audienceLocation ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Audience language
                </dt>
                <dd className="mt-1 text-sm">{record.audienceLanguage ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Added
                </dt>
                <dd className="mt-1 text-sm">{formatDate(record.createdAt, organization?.timezone)}</dd>
              </div>
              {record.profileUrl ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Profile URL
                  </dt>
                  <dd className="mt-1 break-all text-sm">
                    <a
                      href={record.profileUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="underline-offset-4 hover:underline"
                    >
                      {record.profileUrl}
                    </a>
                  </dd>
                </div>
              ) : null}
              {record.notes ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Notes
                  </dt>
                  <dd className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                    {record.notes}
                  </dd>
                </div>
              ) : null}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Social accounts</CardTitle>
          </CardHeader>
          <CardContent>
            {socialAccounts.loading ? (
              <Skeleton className="h-32 w-full" />
            ) : socialAccounts.error ? (
              <ErrorState error={socialAccounts.error} onRetry={() => void socialAccounts.reload()} />
            ) : socialAccounts.data && socialAccounts.data.items.length > 0 ? (
              <Table>
                <caption className="sr-only">Social accounts for this creator</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Platform</TableHead>
                    <TableHead scope="col">Handle</TableHead>
                    <TableHead scope="col">Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {socialAccounts.data.items.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell className="capitalize">{account.platform}</TableCell>
                      <TableCell>
                        {account.url ? (
                          <a
                            href={account.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="underline-offset-4 hover:underline"
                          >
                            {account.handle}
                          </a>
                        ) : (
                          account.handle
                        )}
                        {account.isPrimary ? (
                          <Badge variant="secondary" className="ml-2">
                            Primary
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {account.verified ? (
                          <Badge variant="success">
                            <BadgeCheck className="h-3 w-3" aria-hidden="true" />
                            Verified
                          </Badge>
                        ) : (
                          <Badge variant="muted">Manually entered</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                icon={<BadgeCheck className="h-5 w-5" />}
                title="No social accounts recorded"
                description="Add the creator's handles so the team can recognise their posts."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campaign history</CardTitle>
        </CardHeader>
        <CardContent>
          {campaigns.loading ? (
            <Skeleton className="h-48 w-full" />
          ) : campaigns.error ? (
            <ErrorState error={campaigns.error} onRetry={() => void campaigns.reload()} />
          ) : campaigns.data && campaigns.data.items.length > 0 ? (
            <Table>
              <caption className="sr-only">Campaigns this creator has been assigned to</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Campaign</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col">Runs</TableHead>
                  <TableHead scope="col" className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.data.items.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell>
                      <Link
                        href={`/campaigns/${campaign.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {campaign.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <CampaignStatusBadge status={campaign.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatDate(campaign.startAt, organization?.timezone)} →{' '}
                      {campaign.endAt ? formatDate(campaign.endAt, organization?.timezone) : 'open'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(campaign.costTotal, campaign.currency || currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={<Megaphone className="h-5 w-5" />}
              title="Not assigned to any campaign yet"
              description="Assign this creator to a campaign so their clicks, coupon codes and orders can be attributed."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ButtonLink({
  href,
  label,
  variant = 'ghost',
}: {
  href: string;
  label: string;
  variant?: 'ghost' | 'outline';
}) {
  return (
    <Button asChild variant={variant} size="sm">
      <Link href={href}>
        <ArrowLeft aria-hidden="true" />
        {label}
      </Link>
    </Button>
  );
}
