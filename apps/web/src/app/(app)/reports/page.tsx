'use client';

import * as React from 'react';
import { Download, FileBarChart } from 'lucide-react';

import { api, downloadCsv, type ReportRow } from '@/lib/api';
import { defaultDateRange, toApiRange, type DateRange } from '@/lib/date-range';
import { formatDate } from '@/lib/format';
import { useApiResource } from '@/lib/use-api-resource';
import { useSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
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
import { ATTRIBUTION_METHODS } from '@salestrace/shared-types';

import { DateRangeFilter } from '@/components/shared/date-range-filter';
import { ErrorState } from '@/components/shared/error-state';

type ReportType = 'campaigns' | 'creators' | 'orders' | 'attributions';

const REPORT_TYPES: Array<{ value: ReportType; label: string }> = [
  { value: 'campaigns', label: 'Campaigns' },
  { value: 'creators', label: 'Creators' },
  { value: 'orders', label: 'Orders' },
  { value: 'attributions', label: 'Attributions' },
];

const MAX_PREVIEW_ROWS = 25;

export default function ReportsPage() {
  const { organization } = useSession();
  const [type, setType] = React.useState<ReportType>('campaigns');
  const [range, setRange] = React.useState<DateRange>(() => defaultDateRange(30));
  const [campaignId, setCampaignId] = React.useState('all');
  const [creatorId, setCreatorId] = React.useState('all');
  const [method, setMethod] = React.useState('all');
  const [exporting, setExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState<string | null>(null);

  const campaigns = useApiResource(() => api.campaigns.list({ limit: 100 }), []);
  const creators = useApiResource(() => api.creators.list({ limit: 100 }), []);

  const query = React.useMemo(
    () => ({
      ...toApiRange(range),
      campaignId: campaignId === 'all' ? undefined : campaignId,
      creatorId: creatorId === 'all' ? undefined : creatorId,
      method: method === 'all' ? undefined : method,
      limit: MAX_PREVIEW_ROWS,
    }),
    [range, campaignId, creatorId, method],
  );

  const report = useApiResource(() => api.reports.campaigns(query), [
    type,
    query.from,
    query.to,
    campaignId,
    creatorId,
    method,
  ]);

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      await downloadCsv(
        '/reports/export',
        { ...query, type, limit: undefined },
        `salestrace-${type}-${range.from}-to-${range.to}.csv`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The export could not be generated.';
      setExportError(message);
    } finally {
      setExporting(false);
    }
  }

  const rows = report.data?.items ?? [];
  const columns = React.useMemo(() => {
    const keys = new Set<string>();
    for (const row of rows) {
      for (const key of Object.keys(row)) keys.add(key);
    }
    return Array.from(keys).slice(0, 12);
  }, [rows]);

  const timeZone = organization?.timezone ?? 'Africa/Addis_Ababa';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description={`Preview a report and export it as CSV. All amounts are in ${organization?.currency ?? 'ETB'}.`}
        actions={
          <Button onClick={() => void handleExport()} loading={exporting}>
            <Download aria-hidden="true" />
            Export CSV
          </Button>
        }
      />

      {exportError ? <ErrorState title="Export failed" error={exportError} /> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="report-type" className="text-xs text-muted-foreground">
                Report type
              </Label>
              <Select value={type} onValueChange={(value) => setType(value as ReportType)}>
                <SelectTrigger id="report-type" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_TYPES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DateRangeFilter value={range} onChange={setRange} idPrefix="report-range" />

            <div className="space-y-1.5">
              <Label htmlFor="report-campaign" className="text-xs text-muted-foreground">
                Campaign
              </Label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger id="report-campaign" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All campaigns</SelectItem>
                  {(campaigns.data?.items ?? []).map((campaign) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="report-creator" className="text-xs text-muted-foreground">
                Creator
              </Label>
              <Select value={creatorId} onValueChange={setCreatorId}>
                <SelectTrigger id="report-creator" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All creators</SelectItem>
                  {(creators.data?.items ?? []).map((creator) => (
                    <SelectItem key={creator.id} value={creator.id}>
                      {creator.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="report-method" className="text-xs text-muted-foreground">
                Attribution method
              </Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger id="report-method" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All methods</SelectItem>
                  {ATTRIBUTION_METHODS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preview</CardTitle>
        </CardHeader>
        <CardContent>
          {report.error ? (
            <ErrorState error={report.error} onRetry={() => void report.reload()} />
          ) : report.loading ? (
            <Skeleton className="h-64 w-full" />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<FileBarChart className="h-5 w-5" />}
              title="Nothing to preview"
              description="No rows match the selected filters. Widen the date range or clear a filter."
            />
          ) : (
            <Table>
              <caption className="sr-only">
                Preview of the {type} report ({rows.length} of {report.data?.total ?? rows.length} rows)
              </caption>
              <TableHeader>
                <TableRow>
                  {columns.map((column) => (
                    <TableHead key={column} scope="col">
                      {column}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row: ReportRow, index: number) => (
                  <TableRow key={index}>
                    {columns.map((column) => (
                      <TableCell key={column} className="text-sm">
                        {renderCell(row[column], timeZone)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function renderCell(value: unknown, timeZone: string): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString('en-ET');
  if (typeof value === 'string') {
    // ISO timestamps read better as plain dates.
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDate(value, timeZone);
    return value;
  }
  return JSON.stringify(value);
}
