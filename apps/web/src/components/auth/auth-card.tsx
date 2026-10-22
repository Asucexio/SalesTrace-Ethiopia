import * as React from 'react';

import { cn } from '@/lib/utils';

export interface AuthCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/** Centred card used by every unauthenticated screen. */
export function AuthCard({ title, description, children, footer }: AuthCardProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">
            {process.env.NEXT_PUBLIC_APP_NAME ?? 'SalesTrace Ethiopia'}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          {children}
        </div>

        {footer ? <div className={cn('text-center')}>{footer}</div> : null}
      </div>
    </main>
  );
}
