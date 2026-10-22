import * as React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { SignUpForm } from '@/components/auth/sign-up-form';
import { AuthCard } from '@/components/auth/auth-card';

export const metadata: Metadata = { title: 'Create an account' };

export default function SignUpPage() {
  return (
    <AuthCard
      title="Create your account"
      description="Start attributing influencer campaigns in a few minutes."
      footer={
        <p className="text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <SignUpForm />
    </AuthCard>
  );
}
