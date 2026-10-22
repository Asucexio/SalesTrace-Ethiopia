import * as React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { SignInForm } from '@/components/auth/sign-in-form';
import { AuthCard } from '@/components/auth/auth-card';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <AuthCard
      title="Sign in"
      description="Access your campaigns, creators and attributed revenue."
      footer={
        <p className="text-sm text-muted-foreground">
          New to SalesTrace?{' '}
          <Link href="/signup" className="font-medium text-primary underline-offset-4 hover:underline">
            Create an account
          </Link>
        </p>
      }
    >
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <SignInForm />
      </Suspense>
    </AuthCard>
  );
}
