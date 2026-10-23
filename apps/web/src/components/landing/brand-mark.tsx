import { cn } from '@/lib/utils';

/**
 * The product mark: a trace line that resolves at a single point.
 * Kept as an inline SVG so it inherits the current colour and stays crisp.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary text-primary-foreground',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <path
          d="M5 17.5 10.5 12l3 3L19 6.5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="19" cy="6.5" r="2.25" fill="currentColor" />
        <circle cx="5" cy="17.5" r="1.5" fill="currentColor" fillOpacity="0.45" />
      </svg>
    </span>
  );
}
