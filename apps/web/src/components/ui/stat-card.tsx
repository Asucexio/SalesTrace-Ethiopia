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
      className={cn('rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm', className)}
      {...props}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
          {labelSuffix}
        </p>
        {icon ? (
          <span aria-hidden="true" className="text-muted-foreground">
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
