'use client';

import * as React from 'react';

import { useSession } from '@/lib/session';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClickEventsTable } from '@/components/tracking/click-events-table';
import { CouponCodesTable } from '@/components/tracking/coupon-codes-table';
import { TrackingLinksTable } from '@/components/tracking/tracking-links-table';

export default function TrackingPage() {
  const { role } = useSession();
  const canWrite = role === 'owner' || role === 'admin' || role === 'marketer';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tracking"
        description="Tracking links, coupon codes and the clicks they recorded."
      />

      <Tabs defaultValue="links">
        <TabsList>
          <TabsTrigger value="links">Tracking links</TabsTrigger>
          <TabsTrigger value="coupons">Coupon codes</TabsTrigger>
          <TabsTrigger value="clicks">Click events</TabsTrigger>
        </TabsList>

        <TabsContent value="links">
          <TrackingLinksTable canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="coupons">
          <CouponCodesTable canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="clicks">
          <ClickEventsTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}
