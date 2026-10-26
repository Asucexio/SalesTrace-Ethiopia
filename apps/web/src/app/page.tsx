import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Check,
  FileSpreadsheet,
  Link2,
  Megaphone,
  MousePointerClick,
  QrCode,
  ShieldCheck,
  ShoppingBag,
  Ticket,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import { AttributionPreview } from '@/components/landing/attribution-preview';
import { BrandMark } from '@/components/landing/brand-mark';
import { PricingSection } from '@/components/landing/pricing-section';
import { SiteHeader } from '@/components/landing/site-header';
import { Button } from '@/components/ui/button';

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? 'SalesTrace Ethiopia';

const capabilities: { title: string; description: string; icon: LucideIcon }[] = [
  {
    title: 'Campaigns and creators',
    description: 'Keep budgets, creator fees, agreed costs and campaign status together.',
    icon: Megaphone,
  },
  {
    title: 'Trackable touchpoints',
    description: 'Issue creator-specific links, coupon codes and QR codes on your domain.',
    icon: Link2,
  },
  {
    title: 'Order imports',
    description: 'Map a sales export, review validation errors and detect duplicate orders before import.',
    icon: FileSpreadsheet,
  },
  {
    title: 'Attributed results',
    description: 'Review attributed revenue, cost per attributed order and ROAS by campaign or creator.',
    icon: BarChart3,
  },
];

const steps = [
  { title: 'Set up the campaign', description: 'Add a budget, destination and attribution window.', icon: Megaphone },
  { title: 'Give creators tracking', description: 'Assign fees and create a link, code or QR for each creator.', icon: Users },
  { title: 'Import real orders', description: 'Map your ecommerce export and review rows before committing.', icon: ShoppingBag },
  { title: 'Read the report', description: 'See the signals behind each attributed order and export results.', icon: BarChart3 },
];

const principles = [
  'Clicks, eligible clicks, attributed orders and paid orders stay distinct.',
  'Attribution shows association; it does not claim a creator caused a sale.',
  'Revenue and cost are reported transparently. ROAS is never labelled ROI.',
  'Imported, manually entered and verified data are identified by provenance.',
];

function SectionHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{title}</h2>
      {children ? <p className="mt-4 leading-7 text-muted-foreground">{children}</p> : null}
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader appName={appName} />

      <main id="main" className="flex-1">
        <section className="border-b border-border bg-[linear-gradient(180deg,hsl(var(--muted)/0.55),transparent_78%)]">
          <div className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1fr_0.88fr] lg:items-center lg:gap-16 lg:px-8 lg:py-24">
            <div className="max-w-2xl">
              <p className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-primary">
                <span className="h-px w-7 bg-primary" /> Creator campaign measurement for Ethiopian commerce
              </p>
              <h1 className="max-w-xl text-[2.65rem] font-semibold leading-[1.08] tracking-[-0.04em] sm:text-5xl lg:text-[3.5rem]">
                See which creator activity is <span className="text-primary">linked to real orders.</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                Connect creator links, coupon codes and QR scans to imported sales. Review the attribution rules and report revenue, cost per attributed order and ROAS in ETB.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/signup">Create an account <ArrowRight aria-hidden="true" /></Link>
                </Button>
                <Button asChild size="lg" variant="outline"><Link href="/login">Sign in</Link></Button>
              </div>
              <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-3 text-sm text-muted-foreground">
                {['ETB reporting', 'CSV order imports', 'Your domain for tracking'].map((item) => (
                  <li key={item} className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" aria-hidden="true" />{item}</li>
                ))}
              </ul>
            </div>
            <div className="mx-auto w-full max-w-lg lg:max-w-none">
              <AttributionPreview />
            </div>
          </div>
        </section>

        <section aria-label="Platform capabilities" className="border-b border-border">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-5 px-5 py-6 text-sm font-medium text-muted-foreground sm:grid-cols-3 sm:px-6 lg:grid-cols-5 lg:px-8">
            {[
              [Wallet, 'ETB reporting'], [QrCode, 'Retail QR codes'], [Ticket, 'Coupon attribution'],
              [ShieldCheck, 'Tenant isolation'], [MousePointerClick, 'Click tracking'],
            ].map(([Icon, label]) => {
              const ItemIcon = Icon as LucideIcon;
              return <div key={label as string} className="flex items-center gap-2.5"><ItemIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />{label as string}</div>;
            })}
          </div>
        </section>

        <section id="product" className="scroll-mt-20 border-b border-border">
          <div className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-16 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20 lg:px-8 lg:py-20">
            <SectionHeading eyebrow="The product" title="A clearer line from campaign activity to sales">
              SalesTrace brings campaign setup, creator tracking and order reporting into one workflow, so your team can inspect how a result was matched.
            </SectionHeading>
            <div className="divide-y divide-border border-y border-border">
              {capabilities.map(({ title, description, icon: Icon }, index) => (
                <article key={title} className="grid gap-3 py-5 sm:grid-cols-[2.5rem_1fr] sm:gap-5">
                  <span className="pt-0.5 text-xs font-mono text-muted-foreground">0{index + 1}</span>
                  <div className="flex gap-4">
                    <Icon className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                    <div><h3 className="font-semibold tracking-tight">{title}</h3><p className="mt-1.5 text-sm leading-6 text-muted-foreground">{description}</p></div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-20 border-b border-border bg-muted/35">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-6 lg:px-8 lg:py-20">
            <SectionHeading eyebrow="How it works" title="Four steps. One reviewable result." />
            <ol className="mt-10 grid border-y border-border sm:grid-cols-2 lg:grid-cols-4">
              {steps.map(({ title, description, icon: Icon }, index) => (
                <li key={title} className="border-b border-border py-6 sm:px-5 sm:even:border-l lg:border-b-0 lg:border-l lg:first:border-l-0">
                  <div className="flex items-center justify-between"><span className="font-mono text-sm text-muted-foreground">0{index + 1}</span><Icon className="h-5 w-5 text-primary" aria-hidden="true" /></div>
                  <h3 className="mt-6 font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="principles" className="scroll-mt-20 border-b border-border">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-16 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20 lg:px-8 lg:py-20">
            <div>
              <SectionHeading eyebrow="Reporting principles" title="Clear about what the numbers mean">
                The reporting language follows the calculation rules, so teams can make decisions with the right context.
              </SectionHeading>
              <p className="mt-6 border-l-2 border-primary pl-4 text-sm leading-6 text-muted-foreground">Attribution is association, not causation. SalesTrace does not estimate incrementality or report profit.</p>
            </div>
            <ul className="divide-y divide-border border-y border-border">
              {principles.map((principle, index) => <li key={principle} className="flex gap-4 py-5 text-sm leading-6"><span className="font-mono text-xs text-primary">0{index + 1}</span><span>{principle}</span></li>)}
            </ul>
          </div>
        </section>

        <PricingSection />

        <section className="border-b border-border">
          <div className="mx-auto max-w-6xl px-5 py-14 sm:px-6 lg:px-8 lg:py-16">
            <div className="flex flex-col gap-6 border-y border-primary/20 bg-accent/45 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <div className="max-w-2xl"><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Connect campaign activity to orders you can inspect.</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Set up your workspace and bring your first order export into the reporting flow.</p></div>
              <Button asChild size="lg" className="shrink-0"><Link href="/signup">Get started <ArrowRight aria-hidden="true" /></Link></Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="mt-auto">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-5 py-9 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
            <div className="max-w-sm"><div className="flex items-center gap-2.5"><BrandMark className="h-8 w-8" /><span className="text-sm font-semibold">{appName}</span></div><p className="mt-3 text-sm leading-6 text-muted-foreground">Creator campaign attribution for brands and agencies in Ethiopia.</p></div>
            <nav className="flex flex-wrap gap-x-7 gap-y-3 text-sm text-muted-foreground" aria-label="Footer">
              <a href="#product" className="hover:text-foreground">Product</a><a href="#how-it-works" className="hover:text-foreground">How it works</a><a href="#principles" className="hover:text-foreground">Principles</a><a href="#pricing" className="hover:text-foreground">Pricing</a><Link href="/login" className="hover:text-foreground">Sign in</Link>
            </nav>
          </div>
          <div className="flex flex-col justify-between gap-2 border-t border-border pt-5 text-xs text-muted-foreground sm:flex-row"><p>&copy; {new Date().getFullYear()} {appName}. All rights reserved.</p><p>Attributed revenue and ROAS. Not ROI.</p></div>
        </div>
      </footer>
    </div>
  );
}