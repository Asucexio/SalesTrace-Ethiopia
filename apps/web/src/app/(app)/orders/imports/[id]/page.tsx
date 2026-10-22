'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Download, FileSpreadsheet } from 'lucide-react';

import { api } from '@/lib/api';
import { formatDateTime, formatCount } from '@/lib/format';
import { useApiResource } from '@/lib/use-api-resource';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ErrorState } from '@/components/shared/error-state';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'muted' | 'destructive'> = {
  pending: 'secondary',
  validating: 'warning',
  ready: 'default',
  importing: 'warning',
  completed: 'success',
  failed: 'destructive',
};

export default function ImportJobPage() {
  const params = useParams<{ id: string }>();
  const importId = params?.id ?? '';

  const job = useApiResource(() => api.orders.getImport(importId), [importId]);

  if (job.loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (job.error || !job.data) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/orders/import">
            <ArrowLeft aria-hidden="true" />
            Back to imports
          </Link>
        </Button>
        <ErrorState
          error={job.error ?? 'This import job could not be loaded.'}
          onRetry={() => void job.reload()}
        />
      </div>
    );
  }

  const record = job.data;
  const mappingEntries = Object.entries(record.columnMapping ?? {});
  const rows = record.rows ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={record.fileName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANT[record.status] ?? 'secondary'}>{record.status}</Badge>
            <span>Uploaded {formatDateTime(record.createdAt)}</span>
            {record.completedAt ? (
              <span>· Completed {formatDateTime(record.completedAt)}</span>
            ) : null}
          </span>
        }
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/orders/import">
                <ArrowLeft aria-hidden="true" />
                New import
              </Link>
            </Button>
            {record.errorReportUrl ? (
              <a
                href={api.orders.errorsCsvUrl(importId)}
                download
                className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                <Download aria-hidden="true" />
                Error report
              </a>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Total rows" value={formatCount(record.totalRows)} />
        <Metric label="Valid" value={formatCount(record.validRows)} />
        <Metric label="Invalid" value={formatCount(record.invalidRows)} />
        <Metric label="Imported" value={formatCount(record.importedRows)} />
        <Metric label="Updated" value={formatCount(record.updatedRows)} />
        <Metric label="Skipped" value={formatCount(record.skippedRows)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Column mapping</CardTitle>
        </CardHeader>
        <CardContent>
          {mappingEntries.length === 0 ? (
            <EmptyState
              icon={<FileSpreadsheet className="h-5 w-5" />}
              title="No mapping recorded"
              description="This job has not been given a column mapping yet."
            />
          ) : (
            <Table>
              <caption className="sr-only">Column mapping used for this import</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Target column</TableHead>
                  <TableHead scope="col">Source column</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappingEntries.map(([target, source]) => (
                  <TableRow key={target}>
                    <TableCell className="font-mono text-xs">{target}</TableCell>
                    <TableCell className="font-mono text-xs">{source}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Row errors</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="No row errors"
              description="Every row in this file was processed without a validation error."
            />
          ) : (
            <Table>
              <caption className="sr-only">Rows that failed validation during this import</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Row</TableHead>
                  <TableHead scope="col">Order</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col">Errors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="tabular-nums">{row.rowNumber}</TableCell>
                    <TableCell className="font-medium">
                      {row.externalOrderId ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.status === 'invalid' || row.status === 'duplicate'
                            ? 'destructive'
                            : 'muted'
                        }
                      >
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-destructive">
                      {row.errors.length > 0
                        ? row.errors.map((issue) => issue.message).join(', ')
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">File</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                File name
              </dt>
              <dd className="mt-1 text-sm">{record.fileName}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                File size
              </dt>
              <dd className="mt-1 text-sm">
                {record.fileSizeBytes ? `${(record.fileSizeBytes / 1024).toFixed(1)} KB` : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Import id
              </dt>
              <dd className="mt-1 break-all font-mono text-xs">{record.id}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Error report
              </dt>
              <dd className="mt-1 text-sm">{record.errorReportUrl ? 'Available' : 'None'}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
