'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { useSession } from '@/lib/session';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Gate for every page inside the `(app)` route group.
 *
 * - Not signed in → `/login`
 * - Signed in but without an organization → `/onboarding`
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, organization, loading } = useSession();

  React.useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!organization) {
      router.replace('/onboarding');
    }
  }, [loading, user, organization, router]);

  if (loading) {
    return (
      <div className="space-y-4 p-6" role="status" aria-live="polite">
        <span className="sr-only">Loading your workspace…</span>
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!user || !organization) return null;

  return <>{children}</>;
}
