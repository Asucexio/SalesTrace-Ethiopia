'use client';

import * as React from 'react';

import type { TimeSeriesPoint } from '@salestrace/shared-types';
import { formatDay, formatMoney, EM_DASH } from '@/lib/format';

export interface TimeSeriesChartProps {
  points: TimeSeriesPoint[];
  currency: string;
  /** Height of the drawing area in pixels. */
  height?: number;
  title?: string;
}

/**
 * A hand-drawn daily time series.
 *
 * Bars show eligible clicks; the line shows net attributed revenue. Everything is plain
 * inline SVG — no chart library is installed and none is needed for two series.
 */
export function TimeSeriesChart({
  points,
  currency,
  height = 220,
  title = 'Daily clicks and attributed revenue',
}: TimeSeriesChartProps) {
  const width = 960;
  const padding = { top: 16, right: 16, bottom: 34, left: 64 };

  const innerWidth = Math.max(1, width - padding.left - padding.right);
  const innerHeight = Math.max(1, height - padding.top - padding.bottom);

  const maxClicks = points.reduce((max, point) => Math.max(max, point.eligibleClicks), 0);
  const maxRevenue = points.reduce(
    (max, point) => Math.max(max, Number(point.netAttributedRevenue ?? 0)),
    0,
  );

  const count = points.length;
  const step = count > 0 ? innerWidth / count : innerWidth;
  const barWidth = Math.max(2, Math.min(28, step * 0.6));

  const xFor = (index: number) => padding.left + step * index + step / 2;
  const yForRevenue = (value: number) =>
    padding.top + innerHeight - (maxRevenue === 0 ? 0 : (value / maxRevenue) * innerHeight);

  const revenuePath = points
    .map((point, index) => {
      const value = Number(point.netAttributedRevenue ?? 0);
      return `${index === 0 ? 'M' : 'L'} ${xFor(index).toFixed(2)} ${yForRevenue(value).toFixed(2)}`;
    })
    .join(' ');

  const gridLines = 4;

  return (
    <figure className="w-full">
      <figcaption className="mb-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-primary/70" />
          Eligible clicks
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-0.5 w-4 bg-amber-500" />
          Net attributed revenue
        </span>
      </figcaption>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={title}
        preserveAspectRatio="none"
      >
        {Array.from({ length: gridLines + 1 }).map((_, index) => {
          const ratio = index / gridLines;
          const y = padding.top + innerHeight - ratio * innerHeight;
          return (
            <g key={index}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="currentColor"
                className="text-border"
                strokeWidth={1}
              />
              <text
                x={padding.left - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-muted-foreground text-[10px]"
              >
                {maxClicks === 0
                  ? '0'
                  : Math.round(maxClicks * ratio).toLocaleString('en-ET')}
              </text>
            </g>
          );
        })}

        {points.map((point, index) => {
          const barHeight = maxClicks === 0 ? 0 : (point.eligibleClicks / maxClicks) * innerHeight;
          return (
            <rect
              key={point.date}
              x={xFor(index) - barWidth / 2}
              y={padding.top + innerHeight - barHeight}
              width={barWidth}
              height={Math.max(0, barHeight)}
              rx={2}
              className="fill-primary/70"
            />
          );
        })}

        {points.length > 0 ? (
          <path d={revenuePath} fill="none" stroke="#f59e0b" strokeWidth={2} />
        ) : null}

        {points.map((point, index) => (
          <text
            key={`label-${point.date}`}
            x={xFor(index)}
            y={height - 10}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px]"
          >
            {index % Math.ceil(count / 8) === 0 ? formatDay(point.date) : ''}
          </text>
        ))}
      </svg>

      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Total clicks</th>
            <th scope="col">Eligible clicks</th>
            <th scope="col">Attributed valid orders</th>
            <th scope="col">Net attributed revenue</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.date}>
              <td>{point.date}</td>
              <td>{point.totalClicks}</td>
              <td>{point.eligibleClicks}</td>
              <td>{point.attributedValidOrders}</td>
              <td>
                {point.netAttributedRevenue
                  ? formatMoney(point.netAttributedRevenue, currency)
                  : EM_DASH}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
