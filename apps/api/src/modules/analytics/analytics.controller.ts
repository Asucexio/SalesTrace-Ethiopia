/**
 * Analytics and report controller.
 *
 * The dashboard, the campaign and creator performance tables, the time series and the CSV
 * exports. Every response is computed from the persisted records and scoped to the caller's
 * organization.
 */

import type { Request, Response } from 'express';

import { AppError } from '../../shared/errors.js';
import { sendData } from '../../shared/response.js';

import type { AnalyticsService, AnalyticsFilters } from './analytics.service.js';

export interface AnalyticsControllerDeps {
  service: AnalyticsService;
}

function filtersFrom(req: Request): AnalyticsFilters {
  const auth = req.auth;
  if (!auth) throw AppError.unauthenticated();

  const query = req.query as unknown as {
    from?: string;
    to?: string;
    campaignId?: string[];
    creatorId?: string[];
    status?: string;
    method?: string;
    platform?: string;
    currency?: string;
  };

  return {
    organizationId: auth.organizationId,
    ...(query.from === undefined ? {} : { from: new Date(query.from) }),
    ...(query.to === undefined ? {} : { to: new Date(query.to) }),
    ...(query.campaignId === undefined ? {} : { campaignIds: query.campaignId }),
    ...(query.creatorId === undefined ? {} : { creatorIds: query.creatorId }),
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.method === undefined ? {} : { method: query.method }),
    ...(query.platform === undefined ? {} : { platform: query.platform }),
    ...(query.currency === undefined ? {} : { currency: query.currency }),
  };
}

/** Escape a CSV cell and neutralise spreadsheet formula injection. */
export function toCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';

  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(toCsvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(toCsvCell).join(','));
  }
  return `${lines.join('\n')}\n`;
}

export function createAnalyticsController(deps: AnalyticsControllerDeps) {
  return {
    async overview(req: Request, res: Response): Promise<void> {
      const result = await deps.service.overview(filtersFrom(req));
      sendData(res, result);
    },

    async campaigns(req: Request, res: Response): Promise<void> {
      const result = await deps.service.campaigns(filtersFrom(req));
      sendData(res, result);
    },

    async creators(req: Request, res: Response): Promise<void> {
      const result = await deps.service.creators(filtersFrom(req));
      sendData(res, result);
    },

    async timeseries(req: Request, res: Response): Promise<void> {
      const result = await deps.service.timeseries(filtersFrom(req));
      sendData(res, result);
    },

    /** CSV export. The export honours exactly the same filters as the on-screen report. */
    async export(req: Request, res: Response): Promise<void> {
      const query = req.query as unknown as { type?: string };
      const type = query.type ?? 'campaigns';
      const filters = filtersFrom(req);

      let filename: string;
      let content: string;

      if (type === 'creators') {
        const rows = await deps.service.creators(filters);
        filename = 'salestrace-creators.csv';
        content = toCsv(
          [
            'Creator',
            'Internal code',
            'Platform',
            'Campaigns',
            'Attributed valid orders',
            'Net attributed revenue (ETB)',
            'Creator cost (ETB)',
            'ROAS',
            'Conversion rate (%)',
            'Cost per attributed order (ETB)',
          ],
          rows.map((row) => [
            row['creatorName'],
            row['creatorInternalCode'],
            row['platform'],
            row['campaignCount'],
            row['attributedValidOrders'],
            row['netAttributedRevenue'],
            row['creatorCost'],
            row['roas'] ?? '',
            row['conversionRate'] ?? '',
            row['costPerAttributedOrder'] ?? '',
          ]),
        );
      } else if (type === 'campaigns') {
        const rows = await deps.service.campaigns(filters);
        filename = 'salestrace-campaigns.csv';
        content = toCsv(
          [
            'Campaign',
            'Status',
            'Currency',
            'Creators',
            'Total clicks',
            'Eligible clicks',
            'Attributed valid orders',
            'Gross attributed order value (ETB)',
            'Refund amount (ETB)',
            'Net attributed revenue (ETB)',
            'Campaign cost (ETB)',
            'ROAS',
            'Conversion rate (%)',
            'Cost per attributed order (ETB)',
          ],
          rows.map((row) => [
            row['campaignName'],
            row['status'],
            row['currency'],
            row['creatorCount'],
            row['totalClicks'],
            row['eligibleClicks'],
            row['attributedValidOrders'],
            row['grossAttributedOrderValue'],
            row['refundAmount'],
            row['netAttributedRevenue'],
            row['campaignCost'],
            row['roas'] ?? '',
            row['conversionRate'] ?? '',
            row['costPerAttributedOrder'] ?? '',
          ]),
        );
      } else {
        throw AppError.badRequest('Unsupported export type.');
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(content);
    },
  };
}
