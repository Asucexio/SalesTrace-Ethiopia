/**
 * Time helpers.
 *
 * Storage rule: every timestamp is persisted as `TIMESTAMPTZ` in UTC. Display conversion to the
 * organisation timezone happens in the presentation layer only.
 */

/** Milliseconds in a day. Attribution windows are expressed in whole days of 24 hours. */
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Convert a number of days to milliseconds. */
export function daysToMs(days: number): number {
  return days * MS_PER_DAY;
}

/** Parse an ISO-8601 string into a `Date`; throws on invalid input. */
export function parseIsoDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO-8601 timestamp: "${value}"`);
  }
  return date;
}

/** True when the value is a valid ISO-8601 timestamp. */
export function isValidIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

/** Current time as an ISO-8601 UTC string. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Truncate a timestamp to the start of its UTC day (used by daily time-series grouping). */
export function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0),
  );
}

/** Format a timestamp for display in a specific IANA timezone. */
export function formatInTimeZone(
  value: Date | string,
  timeZone: string,
  locale = 'en-ET',
  options: Intl.DateTimeFormatOptions = {},
): string {
  const date = typeof value === 'string' ? parseIsoDate(value) : value;
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
    ...options,
  }).format(date);
}

/**
 * Interpret a naive timestamp string (no timezone designator) as local time in `timeZone`.
 *
 * CSV exports frequently omit the offset. Rather than silently assuming UTC, the importer
 * resolves the wall-clock time in the organisation's timezone.
 */
export function naiveTimestampToUtc(value: string, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  const wallClock = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? '0'),
  );

  // Offset between the target timezone and UTC at that instant.
  const offset = timezoneOffsetMs(new Date(wallClock), timeZone);
  return new Date(wallClock - offset);
}

/** Offset (ms) of `timeZone` relative to UTC at the given instant. */
export function timezoneOffsetMs(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts = formatter.formatToParts(date);
  const lookup: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') lookup[part.type] = Number(part.value);
  }

  const asUtc = Date.UTC(
    lookup.year ?? 0,
    (lookup.month ?? 1) - 1,
    lookup.day ?? 1,
    lookup.hour === 24 ? 0 : (lookup.hour ?? 0),
    lookup.minute ?? 0,
    lookup.second ?? 0,
  );

  return asUtc - date.getTime();
}
