/**
 * Date-range helpers.
 *
 * The API treats `from` as inclusive and `to` as exclusive. The UI works with plain
 * `YYYY-MM-DD` days and converts to an exclusive ISO range on the way out.
 */

/** Today in the organisation timezone, as `YYYY-MM-DD`. */
export function todayIsoDay(timeZone = 'Africa/Addis_Ababa'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** `YYYY-MM-DD` for the day `days` before today. */
export function isoDayOffset(days: number, timeZone = 'Africa/Addis_Ababa'): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export interface DateRange {
  /** `YYYY-MM-DD`, inclusive. */
  from: string;
  /** `YYYY-MM-DD`, inclusive. */
  to: string;
}

/** The default reporting window: the last 30 days including today. */
export function defaultDateRange(days = 30): DateRange {
  return { from: isoDayOffset(days - 1), to: todayIsoDay() };
}

/** Convert a UI day range into the API's inclusive/exclusive ISO range. */
export function toApiRange(range: DateRange): { from: string; to: string } {
  const from = `${range.from}T00:00:00.000Z`;
  const toExclusive = new Date(`${range.to}T00:00:00.000Z`);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  return { from, to: toExclusive.toISOString() };
}

/** The exclusive upper bound of a single day (`to` is exclusive in the API). */
export function endOfDayExclusive(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

/** The inclusive lower bound of a single day. */
export function startOfDay(day: string): string {
  return `${day}T00:00:00.000Z`;
}
