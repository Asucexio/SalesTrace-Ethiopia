'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/** A button that copies a string to the clipboard. */
export function CopyButton({
  value,
  label = 'Copy',
  className,
  size = 'sm',
  variant = 'outline',
}: {
  value: string;
  label?: string;
  className?: string;
  size?: 'sm' | 'default' | 'icon';
  variant?: 'outline' | 'ghost' | 'default';
}) {
  const [copied, setCopied] = React.useState(false);

  async function handleCopy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const area = document.createElement('textarea');
        area.value = value;
        area.setAttribute('readonly', '');
        area.style.position = 'absolute';
        area.style.left = '-9999px';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        document.body.removeChild(area);
      }
      setCopied(true);
      toast.success('Copied to clipboard');
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('We could not copy that value.');
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn(className)}
      onClick={() => void handleCopy()}
      aria-label={copied ? 'Copied' : label}
    >
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {size !== 'icon' ? <span>{copied ? 'Copied' : label}</span> : null}
    </Button>
  );
}
