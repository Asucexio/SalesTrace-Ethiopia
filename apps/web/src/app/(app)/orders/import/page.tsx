'use client';

import * as React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
  XCircle,
} from 'lucide-react';

import {
  api,
  ApiError,
  type ImportCommitSummary,
  type ImportPreview,
  type ImportPreviewRow,
} from '@/lib/api';
import { importMappingSchema, ORDER_COLUMNS } from '@salestrace/validation';
import { formatDateTime } from '@/lib/format';
import { useApiResource } from '@/lib/use-api-resource';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ErrorState } from '@/components/shared/error-state';

const NOT_MAPPED = '__none__';

const COLUMN_LABEL: Record<string, string> = {
  externalOrderId: 'External order id',
  orderedAt: 'Ordered at',
  currency: 'Currency',
  subtotal: 'Subtotal',
  discount: 'Discount',
  tax: 'Tax',
  shipping: 'Shipping',
  totalPaid: 'Total paid',
  status: 'Status',
  couponCode: 'Coupon code',
  referralIdentifier: 'Referral identifier',
  customerRef: 'Customer reference',
};

type Step = 'upload' | 'mapping' | 'preview' | 'done';

export default function OrderImportPage() {
  const [step, setStep] = React.useState<Step>('upload');
  const [file, setFile] = React.useState<File | null>(null);
  const [fileHeaders, setFileHeaders] = React.useState<string[]>([]);
  const [detectedColumns, setDetectedColumns] = React.useState<string[]>([]);
  const [importId, setImportId] = React.useState<string | null>(null);
  const [mapping, setMapping] = React.useState<Record<string, string>>({});
  const [preview, setPreview] = React.useState<ImportPreview | null>(null);
  const [summary, setSummary] = React.useState<ImportCommitSummary | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const recentImports = useApiResource(() => api.orders.imports({ limit: 5 }), []);

  const columns = detectedColumns.length > 0 ? detectedColumns : fileHeaders;

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError('Choose a CSV file first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const uploaded = await api.orders.upload(file);
      setImportId(uploaded.importId);
      setDetectedColumns(uploaded.detectedColumns ?? []);
      setStep('mapping');
      toast.success('File uploaded');
    } catch (cause) {
      const message =
        cause instanceof ApiError ? cause.message : 'We could not upload that file. Try again.';
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveMapping() {
    if (!importId) return;
    const parsed = importMappingSchema.safeParse({ mapping });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? 'The mapping must include "externalOrderId" and "totalPaid".',
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.orders.setMapping(importId, parsed.data.mapping);
      toast.success('Column mapping saved');
      setStep('preview');
    } catch (cause) {
      const message =
        cause instanceof ApiError ? cause.message : 'We could not save the column mapping.';
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePreview() {
    if (!importId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.orders.preview(importId);
      setPreview(result);
      setStep('preview');
    } catch (cause) {
      const message =
        cause instanceof ApiError ? cause.message : 'We could not validate the file. Try again.';
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    if (!importId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.orders.commit(importId);
      setSummary(result);
      setStep('done');
      toast.success('Import completed');
    } catch (cause) {
      const message =
        cause instanceof ApiError ? cause.message : 'We could not import the orders. Try again.';
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  function handleFileChange(next: File | null) {
    setFile(next);
    setError(null);
    if (!next) {
      setFileHeaders([]);
      return;
    }
    void next
      .text()
      .then((text) => {
        const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
        setFileHeaders(
          firstLine
            .split(',')
            .map((header) => header.trim().replace(/^"|"$/g, ''))
            .filter(Boolean),
        );
      })
      .catch(() => setFileHeaders([]));
  }

  const validRows = preview?.validRows ?? preview?.sampleValid?.length ?? 0;
  const invalidRows = preview?.invalidRows ?? preview?.sampleInvalid?.length ?? 0;
  const totalRows = preview?.totalRows ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import orders"
        description="Upload your order export, map the columns, check the result and commit the import."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/orders">
              <ArrowLeft aria-hidden="true" />
              Back to orders
            </Link>
          </Button>
        }
      />

      <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label="Import steps">
        <StepBadge label="1. Upload" active={step === 'upload'} done={step !== 'upload'} />
        <StepBadge label="2. Map columns" active={step === 'mapping'} done={step === 'preview' || step === 'done'} />
        <StepBadge label="3. Preview" active={step === 'preview'} done={step === 'done'} />
        <StepBadge label="4. Import" active={step === 'done'} done={false} />
      </ol>

      {error ? <ErrorState error={error} onRetry={() => setError(null)} /> : null}

      {step === 'upload' && recentImports.data && recentImports.data.items.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent imports</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <caption className="sr-only">Recent order import jobs</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">File</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col" className="text-right">Rows</TableHead>
                  <TableHead scope="col">Uploaded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentImports.data.items.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      <Link
                        href={`/orders/imports/${job.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {job.fileName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{job.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{job.totalRows}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatDateTime(job.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {step === 'upload' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload a CSV</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpload} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="import-file" className="text-sm font-medium">
                  Order export (CSV)
                </Label>
                <input
                  id="import-file"
                  type="file"
                  accept=".csv,text/csv"
                  className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
                  onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">
                  Maximum 10 MB. The file is sent as the raw request body with
                  <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono">text/csv</code>.
                </p>
              </div>

              {fileHeaders.length > 0 ? (
                <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                  <p className="font-medium">Columns detected in the file</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {fileHeaders.join(', ')}
                  </p>
                </div>
              ) : null}

              <Button type="submit" loading={busy} disabled={!file}>
                <Upload aria-hidden="true" />
                Upload file
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {step === 'mapping' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Map the columns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Tell SalesTrace which column of your file holds each field. <code>externalOrderId</code>{' '}
              and <code>totalPaid</code> are required.
            </p>

            {columns.length === 0 ? (
              <EmptyState
                icon={<FileSpreadsheet className="h-5 w-5" />}
                title="No columns detected"
                description="The API did not report any columns for this file."
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {ORDER_COLUMNS.map((column) => (
                  <div key={column} className="space-y-1.5">
                    <Label htmlFor={`map-${column}`} className="text-sm font-medium">
                      {COLUMN_LABEL[column] ?? column}
                      {column === 'externalOrderId' || column === 'totalPaid' ? (
                        <span className="ml-1 text-destructive">*</span>
                      ) : null}
                    </Label>
                    <Select
                      value={mapping[column] ?? NOT_MAPPED}
                      onValueChange={(value) =>
                        setMapping((previous) => {
                          const next = { ...previous };
                          if (value === NOT_MAPPED) delete next[column];
                          else next[column] = value;
                          return next;
                        })
                      }
                    >
                      <SelectTrigger id={`map-${column}`}>
                        <SelectValue placeholder="Not mapped" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NOT_MAPPED}>Not mapped</SelectItem>
                        {columns.map((header) => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep('upload')} type="button">
                Back
              </Button>
              <Button onClick={() => void handleSaveMapping()} loading={busy}>
                Save mapping and preview
                <ArrowRight aria-hidden="true" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 'preview' ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryCard label="Rows in file" value={totalRows} />
            <SummaryCard label="Valid rows" value={validRows} tone="success" />
            <SummaryCard label="Invalid rows" value={invalidRows} tone="destructive" />
          </div>

          <PreviewRows
            title="Sample of valid rows"
            rows={preview?.sampleValid ?? preview?.valid ?? []}
            empty="No sample valid rows were returned."
          />

          <PreviewRows
            title="Sample of invalid rows"
            rows={preview?.sampleInvalid ?? preview?.invalid ?? []}
            empty="No sample invalid rows were returned."
          />

          {preview?.errors && preview.errors.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Validation messages</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm text-destructive">
                  {preview.errors.map((issue, index) => (
                    <li key={`${issue.code}-${index}`}>
                      {issue.rowNumber ? `Row ${issue.rowNumber}: ` : ''}
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setStep('mapping')} type="button">
              Back to mapping
            </Button>
            <Button variant="secondary" onClick={() => void handlePreview()} loading={busy} type="button">
              Re-check
            </Button>
            <Button onClick={() => void handleCommit()} loading={busy}>
              Import {validRows} valid rows
            </Button>
          </div>
        </div>
      ) : null}

      {step === 'done' && summary ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Import complete</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
              <SummaryCard label="Total rows" value={summary.totalRows} />
              <SummaryCard label="Imported" value={summary.importedRows} tone="success" />
              <SummaryCard label="Updated" value={summary.updatedRows} />
              <SummaryCard label="Skipped" value={summary.skippedRows} />
              <SummaryCard label="Invalid" value={summary.invalidRows} tone="destructive" />
              <SummaryCard
                label="Attributed orders"
                value={summary.attributedOrders ?? '—'}
                tone="success"
              />
            </dl>

            {summary.errorReportUrl ? (
              <a
                href={api.orders.errorsCsvUrl(importId ?? '')}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
                download
              >
                <Download aria-hidden="true" />
                Download the error report
              </a>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/orders">Go to orders</Link>
              </Button>
              {importId ? (
                <Button asChild variant="outline">
                  <Link href={`/orders/imports/${importId}`}>View the import job</Link>
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function StepBadge({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <li
      className={
        active
          ? 'rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground'
          : done
            ? 'rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground'
            : 'rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground'
      }
      aria-current={active ? 'step' : undefined}
    >
      {label}
    </li>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: 'success' | 'destructive';
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={
          tone === 'success'
            ? 'mt-2 text-2xl font-semibold tabular-nums text-emerald-700'
            : tone === 'destructive'
              ? 'mt-2 text-2xl font-semibold tabular-nums text-destructive'
              : 'mt-2 text-2xl font-semibold tabular-nums'
        }
      >
        {value}
      </p>
    </div>
  );
}

function PreviewRows({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: ImportPreviewRow[];
  empty: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <Table>
            <caption className="sr-only">{title}</caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Row</TableHead>
                <TableHead scope="col">Order</TableHead>
                <TableHead scope="col">Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={`${row.rowNumber}-${index}`}>
                  <TableCell className="tabular-nums">{row.rowNumber}</TableCell>
                  <TableCell className="font-medium">{row.externalOrderId ?? '—'}</TableCell>
                  <TableCell>
                    {row.errors && row.errors.length > 0 ? (
                      <span className="inline-flex items-center gap-1 text-sm text-destructive">
                        <XCircle className="h-4 w-4" aria-hidden="true" />
                        {row.errors.map((issue) => issue.message).join(', ')}
                      </span>
                    ) : row.warnings && row.warnings.length > 0 ? (
                      <span className="text-sm text-muted-foreground">
                        {row.warnings.map((issue) => issue.message).join(', ')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-sm text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        Valid
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
