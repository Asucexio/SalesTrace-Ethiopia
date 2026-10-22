'use client';

import * as React from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';

export interface DataTableProps<TData, TValue = unknown> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /** Accessible description of the table. Rendered as a visually hidden `<caption>`. */
  caption: string;
  /** Zero-based page index (server-side pagination). */
  pageIndex: number;
  pageSize: number;
  /** Total number of rows across all pages. */
  total: number;
  onPageChange: (pageIndex: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  /** Controlled sorting state. */
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  /** Set to false when the table paginates on the client. */
  manualPagination?: boolean;
  isLoading?: boolean;
  /** Rendered when there are no rows. */
  emptyState?: React.ReactNode;
  /** Extra controls rendered above the table. */
  toolbar?: React.ReactNode;
  className?: string;
}

/**
 * A table built on TanStack Table.
 *
 * The app talks to a paginated REST API, so pagination and sorting are *manual*: the parent
 * owns the state and passes the current page of rows in.
 */
export function DataTable<TData, TValue = unknown>({
  columns,
  data,
  caption,
  pageIndex,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  sorting,
  onSortingChange,
  manualPagination = true,
  isLoading = false,
  emptyState,
  toolbar,
  className,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    state: { pagination: { pageIndex, pageSize }, sorting },
    getCoreRowModel: getCoreRowModel(),
    manualPagination,
    onSortingChange: (updater) => {
      if (!onSortingChange) return;
      const next = typeof updater === 'function' ? updater(sorting ?? []) : updater;
      onSortingChange(next);
    },
    pageCount: Math.max(1, Math.ceil(total / Math.max(1, pageSize))),
  });

  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const firstRow = total === 0 ? 0 : pageIndex * pageSize + 1;
  const lastRow = Math.min(total, (pageIndex + 1) * pageSize);

  return (
    <div className={cn('space-y-3', className)}>
      {toolbar ? <div className="flex flex-wrap items-end gap-3">{toolbar}</div> : null}

      <div className="relative rounded-lg border border-border bg-card">
        {isLoading ? (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-card/70"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Loading</span>
          </div>
        ) : null}

        <Table>
          <caption className="sr-only">{caption}</caption>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const direction = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      scope="col"
                      aria-sort={
                        direction === 'asc'
                          ? 'ascending'
                          : direction === 'desc'
                            ? 'descending'
                            : 'none'
                      }
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-sm text-left hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <span aria-hidden="true" className="text-[10px]">
                            {direction === 'asc' ? '▲' : direction === 'desc' ? '▼' : '↕'}
                          </span>
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="p-0">
                  {emptyState ?? (
                    <EmptyState title="Nothing to show yet" description="No records match the current filters." />
                  )}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {total === 0 ? 'No records' : `Showing ${firstRow}–${lastRow} of ${total}`}
        </p>
        <div className="flex items-center gap-2">
          {onPageSizeChange ? (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Rows</span>
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                value={pageSize}
                onChange={(event) => onPageSizeChange(Number(event.target.value))}
              >
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pageIndex === 0 || isLoading}
            onClick={() => onPageChange(Math.max(0, pageIndex - 1))}
          >
            <ChevronLeft aria-hidden="true" />
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {pageIndex + 1} of {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pageIndex + 1 >= pageCount || isLoading}
            onClick={() => onPageChange(pageIndex + 1)}
          >
            Next
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}
