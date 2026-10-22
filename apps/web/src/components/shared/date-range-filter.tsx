'use client';

import * as React from 'react';

import type { DateRange } from '@/lib/date-range';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface DateRangeFilterProps {
  value: DateRange;
  onChange: (value: DateRange) => void;
  idPrefix?: string;
}

/** Two date inputs that filter a report by day range. */
export function DateRangeFilter({ value, onChange, idPrefix = 'date' }: DateRangeFilterProps) {
  const fromId = `${idPrefix}-from`;
  const toId = `${idPrefix}-to`;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label htmlFor={fromId} className="text-xs text-muted-foreground">
          From
        </Label>
        <Input
          id={fromId}
          type="date"
          className="w-40"
          value={value.from}
          max={value.to}
          onChange={(event) => onChange({ ...value, from: event.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={toId} className="text-xs text-muted-foreground">
          To
        </Label>
        <Input
          id={toId}
          type="date"
          className="w-40"
          value={value.to}
          min={value.from}
          onChange={(event) => onChange({ ...value, to: event.target.value })}
        />
      </div>
    </div>
  );
}
