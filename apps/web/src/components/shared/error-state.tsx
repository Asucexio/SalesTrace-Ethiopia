'use client';

import * as React from 'react';

import { formatErrorMessage } from '@/lib/format';
import { AlertTriangle } from 'lucide-react';

/** A readable error panel used whenever a request fails. */
export function ErrorState({
  title = 'Something went wrong',
  error,
  onRetry,
}: {
  title?: string;
  error: unknown;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
    >
      <div className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        {title}
      </div>
      <p className="text-destructive/90">{formatErrorMessage(error)}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="text-sm font-medium underline underline-offset-4"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
