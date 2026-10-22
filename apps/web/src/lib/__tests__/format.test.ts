import { describe, expect, it } from 'vitest';

import {
  EM_DASH,
  formatCount,
  formatDate,
  formatMoney,
  formatMoneyAmount,
  formatPercent,
  formatRate,
  toMinorUnits,
} from '../format';

/** `Intl.NumberFormat('en-ET', { style: 'currency' })` separates the symbol with U+00A0. */
const NBSP = '\u00a0';

describe('formatMoney', () => {
  it('formats a decimal string with the workspace currency', () => {
    expect(formatMoney('88500.00', 'ETB')).toBe(`ETB${NBSP}88,500.00`);
  });

  it('keeps both decimal places for small amounts', () => {
    expect(formatMoney('0.10', 'ETB')).toBe(`ETB${NBSP}0.10`);
    expect(formatMoney('1234567.89', 'ETB')).toBe(`ETB${NBSP}1,234,567.89`);
  });

  it('parses the amount into exact minor units instead of using parseFloat', () => {
    expect(toMinorUnits('88500.00')).toBe(8_850_000);
    expect(toMinorUnits('0.1')).toBe(10);
    expect(toMinorUnits('1,500.50')).toBe(150_050);
  });

  it('renders an em dash for a missing or unusable amount', () => {
    expect(formatMoney(null)).toBe(EM_DASH);
    expect(formatMoney(undefined)).toBe(EM_DASH);
    expect(formatMoney('')).toBe(EM_DASH);
    expect(formatMoney('not a number')).toBe(EM_DASH);
  });

  it('can format the amount without the currency symbol', () => {
    expect(formatMoneyAmount('88500.00')).toBe('88,500.00');
    expect(formatMoneyAmount(null)).toBe(EM_DASH);
  });
});

describe('formatRate', () => {
  it('renders a null rate as an em dash, never NaN, Infinity or 0%', () => {
    expect(formatRate(null)).toBe(EM_DASH);
    expect(formatRate(undefined)).toBe(EM_DASH);
    expect(formatPercent(null)).toBe(EM_DASH);
    expect(formatPercent(undefined)).toBe(EM_DASH);
  });

  it('renders a non-finite rate as an em dash', () => {
    expect(formatRate(Number.NaN)).toBe(EM_DASH);
    expect(formatRate(Number.POSITIVE_INFINITY)).toBe(EM_DASH);
    expect(formatPercent(Number.NaN)).toBe(EM_DASH);
  });

  it('formats ratios with two decimals', () => {
    expect(formatRate(2.21)).toBe('2.21');
    expect(formatRate(0)).toBe('0.00');
  });

  it('formats percentages with two decimals', () => {
    expect(formatPercent(9.78)).toBe('9.78%');
    expect(formatPercent(0)).toBe('0.00%');
  });
});

describe('formatCount', () => {
  it('groups thousands', () => {
    expect(formatCount(1240)).toBe('1,240');
    expect(formatCount(0)).toBe('0');
  });

  it('renders an em dash for a missing count', () => {
    expect(formatCount(null)).toBe(EM_DASH);
  });
});

describe('formatDate', () => {
  it('renders a date in the organisation timezone', () => {
    expect(formatDate('2026-03-01T00:00:00.000Z', 'Africa/Addis_Ababa')).toBe('Mar 1, 2026');
  });

  it('renders an em dash for a missing or invalid date', () => {
    expect(formatDate(null)).toBe(EM_DASH);
    expect(formatDate('not a date')).toBe(EM_DASH);
  });
});
