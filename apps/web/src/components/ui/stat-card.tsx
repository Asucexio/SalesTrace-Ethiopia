import * as React from 'react';

import { cn } from '@/lib/utils';

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: React.ReactNode;
  /** Optional supporting line, e.g. "9 of 12 creators have a recorded cost". */
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  /** Rendered next to the label — usually an info tooltip. */
  labelSuffix?: React.ReactNode;
}

/** A single headline metric. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  labelSuffix,
  className,
  ...props
}: StatCardProps) {
  return (
    <div
      className={cn('rounded-xl border border-border/80 bg-card p-4 text-card-foreground shadow-[0_2px_12px_-8px_hsl(var(--foreground)/0.18)] sm:p-5', className)}
      {...props}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {label}
          {labelSuffix}
        </p>
        {icon ? (
          <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/70 text-primary">
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight sm:text-[1.75rem]">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
