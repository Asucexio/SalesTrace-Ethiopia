import * as React from 'react';
import type { Metadata } from 'next';
import { Suspense } from 'react';

import { OrganizationOnboarding } from '@/components/auth/organization-onboarding';
import { AuthCard } from '@/components/auth/auth-card';

export const metadata: Metadata = { title: 'Create your workspace' };

export default function OnboardingPage() {
  return (
    <AuthCard
      title="Create your workspace"
      description="Set up the workspace that will hold your campaigns, creators and orders."
    >
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <OrganizationOnboarding />
      </Suspense>
    </AuthCard>
  );
}
