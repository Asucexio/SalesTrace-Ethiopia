/**
 * Presentation helpers.
 *
 * Rules that this module enforces, and that the rest of the app relies on:
 *
 *  - Monetary amounts arrive from the API as **decimal strings** (`"88500.00"`). They are
 *    parsed into exact integer minor units with `parseAmountToMinor` and only then handed to
 *    `Intl.NumberFormat` for display. `parseFloat` is never used to make a display decision.
 *  - Rates may be `null` (zero denominator). `null` is rendered as an em dash `—`; `NaN`,
 *    `Infinity` and a misleading `0%` are never rendered.
 *  - ROAS is labelled "ROAS" and revenue is labelled "attributed revenue". The word "ROI" is
 *    never used.
 */

import { minorToDecimalString, parseAmountToMinor } from '@salestrace/shared-types';

/** The em dash used whenever a value is not defined. */
export const EM_DASH = '—';

export const DEFAULT_CURRENCY = 'ETB';
export const DEFAULT_LOCALE = 'en-ET';

/** Number of decimals used for money. */
const MONEY_FRACTION_DIGITS = 2;

function currencyFormatter(currency: string, locale = DEFAULT_LOCALE): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: MONEY_FRACTION_DIGITS,
      maximumFractionDigits: MONEY_FRACTION_DIGITS,
    });
  } catch {
    // An unknown currency code must never crash a page.
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: MONEY_FRACTION_DIGITS,
      maximumFractionDigits: MONEY_FRACTION_DIGITS,
    });
  }
}

/**
 * Convert a decimal money string to exact minor units.
 *
 * Returns `null` for `null`/`undefined`/unparseable input so callers can render an em dash
 * instead of `NaN`.
 */
export function toMinorUnits(amount: string | number | null | undefined): number | null {
  if (amount === null || amount === undefined || amount === '') return null;
  try {
    return parseAmountToMinor(amount);
  } catch {
    return null;
  }
}

/**
 * Format a monetary amount for display.
 *
 * @example formatMoney('88500.00', 'ETB') // "ETB 88,500.00"
 */
export function formatMoney(
  amount: string | number | null | undefined,
  currency: string = DEFAULT_CURRENCY,
  locale: string = DEFAULT_LOCALE,
): string {
  const minor = toMinorUnits(amount);
  if (minor === null) return EM_DASH;
  return currencyFormatter(currency, locale).format(minor / 100);
}

/**
 * Format a monetary amount without the currency symbol (useful inside a table column that
 * already states the currency).
 */
export function formatMoneyAmount(
  amount: string | number | null | undefined,
  locale: string = DEFAULT_LOCALE,
): string {
  const minor = toMinorUnits(amount);
  if (minor === null) return EM_DASH;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: MONEY_FRACTION_DIGITS,
    maximumFractionDigits: MONEY_FRACTION_DIGITS,
  }).format(minor / 100);
}

/**
 * Format a *rate* (conversion rate, ROAS, …).
 *
 * `null` (zero denominator) renders as an em dash — never `0`, `NaN` or `Infinity`.
 */
export function formatRate(
  value: number | null | undefined,
  options: { percent?: boolean; digits?: number } = {},
): string {
  const { percent = false, digits = 2 } = options;
  if (value === null || value === undefined || !Number.isFinite(value)) return EM_DASH;
  const fixed = value.toFixed(digits);
  return percent ? `${fixed}%` : fixed;
}

/** Format a percentage rate. `null` renders as an em dash. */
export function formatPercent(value: number | null | undefined, digits = 2): string {
  return formatRate(value, { percent: true, digits });
}

/** Format a plain integer count. */
export function formatCount(value: number | null | undefined, locale: string = DEFAULT_LOCALE): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EM_DASH;
  return new Intl.NumberFormat(locale).format(value);
}

/** Format an ISO timestamp as a date in the organisation timezone. */
export function formatDate(
  value: string | Date | null | undefined,
  timeZone?: string,
  locale: string = DEFAULT_LOCALE,
): string {
  if (!value) return EM_DASH;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return EM_DASH;
  return new Intl.DateTimeFormat(locale, {
    timeZone: timeZone ?? 'Africa/Addis_Ababa',
    dateStyle: 'medium',
  }).format(date);
}

/** Format an ISO timestamp as a date *and* time in the organisation timezone. */
export function formatDateTime(
  value: string | Date | null | undefined,
  timeZone?: string,
  locale: string = DEFAULT_LOCALE,
): string {
  if (!value) return EM_DASH;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return EM_DASH;
  return new Intl.DateTimeFormat(locale, {
    timeZone: timeZone ?? 'Africa/Addis_Ababa',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

/** Format a date-only string (`YYYY-MM-DD`) without shifting it into another day. */
export function formatDay(value: string | null | undefined, locale: string = DEFAULT_LOCALE): string {
  if (!value) return EM_DASH;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return formatDate(value, undefined, locale);
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))));
}

/** Truncate a string for table cells. */
export function truncate(value: string | null | undefined, max = 60): string {
  if (!value) return EM_DASH;
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Render an arbitrary API error payload as a readable sentence. */
export function formatErrorMessage(error: unknown): string {
  if (!error) return 'Something went wrong.';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return 'Something went wrong.';
}

/** Turn a human label into a URL-safe slug. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Normalise a decimal string to two decimals without touching binary floating point rules. */
export function normalizeDecimalString(amount: string | number): string {
  const minor = toMinorUnits(amount);
  if (minor === null) return '0.00';
  return minorToDecimalString(minor);
}
