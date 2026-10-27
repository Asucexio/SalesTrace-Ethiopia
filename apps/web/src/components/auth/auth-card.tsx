import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, ShieldCheck } from 'lucide-react';

import { BrandMark } from '@/components/landing/brand-mark';
import { ThemeToggle } from '@/components/theme-toggle';
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
    <main className="relative min-h-screen overflow-hidden bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(460px,0.9fr)]">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(var(--primary)/0.08),transparent)] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(var(--primary)/0.2),transparent)]" />
      <section className="relative hidden min-h-screen flex-col justify-between overflow-hidden px-10 py-9 text-white lg:flex xl:px-16">
        <div className="absolute inset-0">
          <img src="/hero-analytics.jpg" alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-br from-blue-900/95 via-primary/90 to-blue-950/95" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.3),transparent_70%)]" />
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,transparent_40%,rgba(255,255,255,0.05))]" />
        <Link href="/" className="relative inline-flex w-fit items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
          <BrandMark className="bg-white text-primary" />
          <span className="font-display text-base font-semibold tracking-tight">{appName}</span>
        </Link>

        <div className="relative max-w-xl py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Creator campaign measurement</p>
          <h2 className="mt-5 max-w-lg font-display text-4xl font-semibold leading-tight tracking-[-0.035em] xl:text-5xl">
            Follow the evidence from creator activity to orders.
          </h2>
          <p className="mt-5 max-w-lg text-base leading-7 text-white/80">
            Keep campaign costs, tracking signals and imported sales in one workspace, with clear rules behind every attributed result.
          </p>
          <ul className="mt-8 space-y-4 text-sm text-white/90">
            <li className="flex items-center gap-3"><Check className="h-4 w-4" aria-hidden="true" />Links, coupons and QR codes for creators</li>
            <li className="flex items-center gap-3"><Check className="h-4 w-4" aria-hidden="true" />Order imports with validation</li>
            <li className="flex items-center gap-3"><Check className="h-4 w-4" aria-hidden="true" />Revenue and ROAS reported in ETB</li>
          </ul>
        </div>

        <div className="relative flex items-center gap-2 text-xs text-white/75">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          <span>Transparent attribution. No invented performance claims.</span>
        </div>
      </section>

      <section className="relative flex min-h-screen flex-col px-5 py-5 sm:px-8 lg:px-12">
        <div className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 rounded-lg text-sm font-semibold tracking-tight text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden">
            <BrandMark className="h-8 w-8" />{appName}
          </Link>
          <div className="flex items-center gap-2 ml-auto">
            <ThemeToggle />
            <Link href="/" className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Back to home</span>
              <span className="sm:hidden">Home</span>
            </Link>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[440px]">
            <div className="mb-8 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Your workspace</p>
              <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-[2.25rem]">{title}</h1>
              {description ? <p className="text-sm leading-6 text-muted-foreground">{description}</p> : null}
            </div>

            <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-xl p-6 shadow-xl shadow-black/5 dark:shadow-black/20 sm:p-8">
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
