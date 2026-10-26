import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Plan = {
  name: string;
  price: string;
  /** Short unit shown next to the price, e.g. "/ month". Omit for free plans. */
  unit?: string;
  summary: string;
  features: string[];
  cta: string;
  recommended?: boolean;
};

/**
 * TODO(before launch): every price, limit and plan name below is PLACEHOLDER copy.
 * Replace it with your real plans. Keep prices in ETB to match the rest of the page.
 */
const plans: Plan[] = [
  {
    name: 'Starter',
    price: 'Free',
    summary: 'Run your first campaign and see how attribution works.',
    features: [
      '1 active campaign',
      'Up to 5 creators',
      'Tracking links, coupon codes and QR codes',
      'CSV order imports with validation',
      'Attributed revenue and ROAS report',
    ],
    cta: 'Start for free',
  },
  {
    name: 'Growth',
    price: 'ETB 2,500',
    unit: '/ month',
    summary: 'For brands running creator campaigns every month.',
    features: [
      'Everything in Starter',
      'Unlimited active campaigns',
      'Unlimited creators',
      'Duplicate order detection',
      'Report exports',
    ],
    cta: 'Create an account',
    recommended: true,
  },
  {
    name: 'Agency',
    price: 'ETB 7,500',
    unit: '/ month',
    summary: 'For agencies managing campaigns across several brands.',
    features: [
      'Everything in Growth',
      'Separate workspace per brand',
      'Team members and roles',
      'Priority support',
    ],
    cta: 'Create an account',
  },
];

/**
 * Pricing section. Server component: no client state, so it adds no JavaScript.
 * Plans render as a list of cards; the recommended plan gets a stronger border and a badge.
 */
export function PricingSection() {
  return (
    <section id="pricing" aria-labelledby="pricing-heading" className="scroll-mt-20 border-b border-border bg-muted/35">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Pricing</p>
          <h2 id="pricing-heading" className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Start free. Pay when you scale.
          </h2>
          <p className="mt-4 leading-7 text-muted-foreground">
            Every plan includes ETB reporting and tracking on your own domain. Upgrade when you run more campaigns.
          </p>
        </div>

        <ul className="mt-10 grid gap-6 lg:grid-cols-3 lg:items-stretch">
          {plans.map((plan) => (
            <li
              key={plan.name}
              className={cn(
                'relative flex flex-col rounded-xl border bg-card p-6 sm:p-7',
                plan.recommended
                  ? 'border-primary shadow-xl shadow-primary/10 ring-1 ring-primary'
                  : 'border-border',
              )}
            >
              {plan.recommended ? (
                <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                  Recommended
                </span>
              ) : null}

              <h3 className="font-display text-lg font-semibold tracking-tight">{plan.name}</h3>
              <p className="mt-1.5 min-h-[3rem] text-sm leading-6 text-muted-foreground">{plan.summary}</p>

              <p className="mt-5 flex items-baseline gap-1.5">
                <span className="font-display text-4xl font-semibold tracking-tight tabular-nums">{plan.price}</span>
                {plan.unit ? <span className="text-sm text-muted-foreground">{plan.unit}</span> : null}
              </p>

              <Button asChild size="lg" variant={plan.recommended ? 'default' : 'outline'} className="mt-6 w-full">
                <Link href="/signup">
                  {plan.cta}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>

              <ul className="mt-6 space-y-3 border-t border-border pt-6 text-sm leading-6">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-3">
                    <Check className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-xs text-muted-foreground">All prices in Ethiopian birr (ETB).</p>
      </div>
    </section>
  );
}