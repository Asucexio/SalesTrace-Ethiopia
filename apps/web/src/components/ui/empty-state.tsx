import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const emptyStateVariants = cva('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', {
  variants: {
    size: {
      default: 'py-12',
      sm: 'py-8',
      lg: 'py-16',
    },
  },
  defaultVariants: { size: 'default' },
});

export interface EmptyStateProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof emptyStateVariants> {
  /** Decorative icon. Should be an element that accepts `aria-hidden`. */
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  /** Call to action — usually a `<Button>` or a `<Link>`. */
  action?: React.ReactNode;
}

/**
 * The single way this app renders "there is nothing here yet".
 *
 * It always carries an icon, a title, a description and (where sensible) a call to action so
 * that a blank screen is never shown and no fake metric is invented.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  size,
  ...props
}: EmptyStateProps) {
  return (
    <div className={cn(emptyStateVariants({ size }), className)} {...props}>
      {icon ? (
        <div
          aria-hidden="true"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground"
        >
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? (
          <p className="mx-auto max-w-md text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
