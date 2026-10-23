import { Check, GitBranch, MousePointerClick, Ticket } from 'lucide-react';

function SignalIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
      {children}
    </span>
  );
}

/**
 * An illustrative attribution record. It shows the actual rule shape — click, coupon,
 * deterministic resolution — rather than a fabricated dashboard or customer result.
 */
export function AttributionPreview() {
  return (
    <div className="relative">
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xl shadow-primary/10">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <GitBranch className="h-4 w-4" aria-hidden="true" />
            </span>
            <p className="text-sm font-semibold">Attribution record</p>
          </div>
          <p className="font-mono text-[11px] text-muted-foreground">rule v1 · 7-day window</p>
        </div>

        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Order
            </p>
            <p className="mt-1 font-mono text-sm font-medium">#ET-10428</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Paid · 2 Jul</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Net revenue
            </p>
            <p className="mt-1 font-display text-lg font-semibold tabular-nums">ETB 1,650</p>
          </div>
        </div>

        <div className="px-5 pb-5 pt-1">
          <p className="py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Signals
          </p>
          <ol className="space-y-4">
            <li className="flex gap-3">
              <SignalIcon>
                <MousePointerClick className="h-4 w-4" aria-hidden="true" />
              </SignalIcon>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <p className="text-sm font-medium">Tracking click</p>
                  <p className="font-mono text-[11px] text-muted-foreground">1 Jul · 14:22</p>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Hana Tesfaye · /r/7K2M9Q · eligible
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <SignalIcon>
                <Ticket className="h-4 w-4" aria-hidden="true" />
              </SignalIcon>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <p className="text-sm font-medium">Coupon match</p>
                  <p className="font-mono text-[11px] text-muted-foreground">SPRING20</p>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Associated with Hana Tesfaye · supporting signal
                </p>
              </div>
            </li>
          </ol>
        </div>

        <div className="border-t border-border bg-muted/30 px-5 py-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            Resolution
          </div>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
            Both signals point to the same creator. The last eligible click wins; the coupon is
            stored as supporting evidence.
          </p>
        </div>

        <div className="border-t border-border bg-accent/60 px-5 py-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-foreground/80">
                Attributed to
              </p>
              <p className="mt-1 font-display text-base font-semibold text-accent-foreground">
                Hana Tesfaye
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-foreground/80">
                ROAS
              </p>
              <p className="mt-0.5 font-display text-xl font-semibold tabular-nums text-accent-foreground">
                3.3×
              </p>
            </div>
          </div>
          <p className="mt-2 text-xs text-accent-foreground/80">
            ETB 1,650 attributed revenue ÷ ETB 500 campaign cost
          </p>
        </div>
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        Illustrative record. Attribution is association, not causation.
      </p>
    </div>
  );
}
