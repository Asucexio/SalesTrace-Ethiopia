/**
 * Monetary helpers.
 *
 * Authoritative representation of money is an **integer number of minor units** (santim for ETB):
 * 1 ETB = 100 minor units. Decimal strings are parsed with string manipulation only — never
 * `parseFloat` — so no binary floating point error can enter the system.
 *
 * Minor-unit integers are exact as IEEE-754 doubles while below `Number.MAX_SAFE_INTEGER`
 * (2^53 - 1), i.e. up to 90,071,992,547,409.93 ETB. Validation rejects any amount above
 * `MAX_AMOUNT_MINOR`, so every stored amount is exact.
 */

/** Minor units per major unit. ETB uses 2 decimals. */
export const MINOR_UNITS_PER_MAJOR = 100;

/** Maximum accepted amount in minor units (≈ 90 trillion ETB). */
export const MAX_AMOUNT_MINOR = 9_000_000_000_000_000;

export class MoneyParseError extends Error {
  constructor(
    message: string,
    readonly input: unknown,
  ) {
    super(message);
    this.name = 'MoneyParseError';
  }
}

/**
 * Parse a decimal money string into minor units.
 *
 * Accepted: `"1500"`, `"1500.5"`, `"1500.50"`, `"1,500.00"`, `" 250 "`, `"-40.00"`.
 * Rejected: `"1.234"` (more than 2 decimals), `"abc"`, `"1e5"`, `"ETB 100"`, `""`.
 */
export function parseAmountToMinor(value: string | number): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new MoneyParseError('Amount must be a finite number.', value);
    }
    // Avoid the float round-trip: re-render through the string parser.
    return parseAmountToMinor(numberToPlainDecimalString(value));
  }

  if (typeof value !== 'string') {
    throw new MoneyParseError('Amount must be a string or number.', value);
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    throw new MoneyParseError('Amount must not be empty.', value);
  }

  const normalized = trimmed.replace(/,/g, '');
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) {
    throw new MoneyParseError(`"${value}" is not a valid monetary amount.`, value);
  }

  const sign = match[1] === '-' ? -1 : 1;
  const whole = match[2] ?? '0';
  const fraction = match[3] ?? '';

  if (fraction.length > 2) {
    throw new MoneyParseError(
      `"${value}" has more than ${MINOR_UNITS_PER_MAJOR / 10} decimal places.`,
      value,
    );
  }

  const minorFraction = Number(fraction.padEnd(2, '0'));
  const wholePart = Number(whole);
  if (!Number.isSafeInteger(wholePart)) {
    throw new MoneyParseError(`"${value}" is out of range.`, value);
  }

  const minor = wholePart * MINOR_UNITS_PER_MAJOR + minorFraction;
  if (minor > MAX_AMOUNT_MINOR) {
    throw new MoneyParseError(`"${value}" exceeds the maximum supported amount.`, value);
  }

  return sign * minor;
}

/** Render a float without exponent notation so it can be re-parsed exactly. */
export function numberToPlainDecimalString(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}

/**
 * Convert minor units to an exact decimal string, e.g. `8850000` → `"88500.00"`.
 * Used for API responses so clients never receive a float that might round-trip badly.
 */
export function minorToDecimalString(minor: number): string {
  if (!Number.isSafeInteger(minor)) {
    throw new MoneyParseError('Amount in minor units must be a safe integer.', minor);
  }
  const negative = minor < 0;
  const absolute = Math.abs(minor);
  const whole = Math.floor(absolute / MINOR_UNITS_PER_MAJOR);
  const fraction = absolute % MINOR_UNITS_PER_MAJOR;
  const formatted = `${whole}.${String(fraction).padStart(2, '0')}`;
  return negative ? `-${formatted}` : formatted;
}

/**
 * Divide two integer minor-unit amounts and round half-up to `decimals` places.
 *
 * Returns `null` when the denominator is zero — the platform never produces `NaN` or
 * `Infinity` for a zero denominator.
 */
export function divideRoundHalfUp(
  numerator: number,
  denominator: number,
  decimals = 2,
): number | null {
  if (denominator === 0) return null;

  const negative = numerator < 0 !== denominator < 0; // (a < 0) !== (b < 0)
  const n = BigInt(Math.abs(Math.trunc(numerator)));
  const d = BigInt(Math.abs(Math.trunc(denominator)));
  const scale = 10n ** BigInt(decimals);

  // half-up: multiply by 2*scale, add denominator, then integer-divide.
  const scaled = (n * scale * 2n + d) / (d * 2n);
  const result = Number(scaled) / Number(scale);
  return negative ? -result : result;
}

/**
 * Round a ratio expressed in percent (0–100) to 2 decimals, half-up.
 *
 * `null` when the denominator is zero — the platform never renders `NaN` or `Infinity`.
 */
export function percentage(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  // Round directly at the target precision — no double rounding.
  return divideRoundHalfUp(numerator * 100, denominator, 2);
}

/** Sum minor-unit amounts safely (exact while below `MAX_SAFE_INTEGER`). */
export function sumMinor(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isSafeInteger(total)) {
      throw new MoneyParseError('Sum of amounts exceeds the safe integer range.', total);
    }
  }
  return total;
}

/** Format minor units for display, e.g. `"88,500.00 ETB"`. */
export function formatMinorForDisplay(minor: number, currency: string, locale = 'en-ET'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / MINOR_UNITS_PER_MAJOR);
}
