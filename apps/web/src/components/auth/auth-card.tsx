import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, ShieldCheck } from 'lucide-react';

import { BrandMark } from '@/components/landing/brand-mark';
import { cn } from '@/lib/utils';

export interface AuthCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/** Branded, responsive shell shared by unauthenticated screens. */
export function AuthCard({ title, description, children, footer }: AuthCardProps) {
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? 'SalesTrace Ethiopia';

  return (
    <main className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(430px,0.86fr)]">
      <section className="relative hidden min-h-screen flex-col justify-between overflow-hidden bg-primary px-10 py-9 text-primary-foreground lg:flex xl:px-16">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,transparent_40%,rgba(255,255,255,0.09))]" />
        <Link href="/" className="relative inline-flex w-fit items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground">
          <BrandMark className="bg-primary-foreground text-primary" />
          <span className="font-display text-base font-semibold tracking-tight">{appName}</span>
        </Link>

        <div className="relative max-w-xl py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-foreground/70">Creator campaign measurement</p>
          <h2 className="mt-5 max-w-lg font-display text-4xl font-semibold leading-tight tracking-[-0.035em] xl:text-5xl">
            Follow the evidence from creator activity to orders.
          </h2>
          <p className="mt-5 max-w-lg text-base leading-7 text-primary-foreground/80">
            Keep campaign costs, tracking signals and imported sales in one workspace, with clear rules behind every attributed result.
          </p>
          <ul className="mt-8 space-y-4 text-sm text-primary-foreground/90">
            <li className="flex items-center gap-3"><Check className="h-4 w-4" aria-hidden="true" />Links, coupons and QR codes for creators</li>
            <li className="flex items-center gap-3"><Check className="h-4 w-4" aria-hidden="true" />Order imports with validation</li>
            <li className="flex items-center gap-3"><Check className="h-4 w-4" aria-hidden="true" />Revenue and ROAS reported in ETB</li>
          </ul>
        </div>

        <div className="relative flex items-center gap-2 text-xs text-primary-foreground/75">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          <span>Transparent attribution. No invented performance claims.</span>
        </div>
      </section>

      <section className="flex min-h-screen flex-col px-5 py-5 sm:px-8 lg:px-12">
        <div className="flex items-center justify-between lg:justify-end">
          <Link href="/" className="inline-flex items-center gap-2 rounded-md text-sm font-semibold tracking-tight text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden">
            <BrandMark className="h-8 w-8" />{appName}
          </Link>
          <Link href="/" className="inline-flex items-center gap-2 rounded-md py-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Back to home</span>
            <span className="sm:hidden">Home</span>
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[420px]">
            <div className="mb-8 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Your workspace</p>
              <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-[2rem]">{title}</h1>
              {description ? <p className="text-sm leading-6 text-muted-foreground">{description}</p> : null}
            </div>

            <div className="rounded-xl border border-border bg-card p-5 shadow-[0_12px_40px_-28px_hsl(var(--foreground)/0.22)] sm:p-7">
              {children}
            </div>

            {footer ? <div className={cn('mt-6 text-center')}>{footer}</div> : null}
            <p className="mt-8 text-center text-xs leading-5 text-muted-foreground">By continuing, you will access your organization’s campaign and sales data.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
