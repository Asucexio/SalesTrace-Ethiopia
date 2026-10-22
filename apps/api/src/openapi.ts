/**
 * The OpenAPI document.
 *
 * Written by hand rather than generated: the deployment environment could not install a
 * schema-to-OpenAPI generator, and the document is a developer-facing contract that the API
 * specification document already describes in prose.
 *
 * Served at `GET /api/v1/openapi.json`.
 */

import { getEnv } from './config/env.js';

interface OperationObject {
  summary: string;
  description?: string;
  tags: string[];
  parameters?: unknown[];
  requestBody?: unknown;
  responses: Record<string, unknown>;
  security?: unknown[];
}

function jsonBody(schema: unknown, required = true): unknown {
  return {
    required,
    content: { 'application/json': { schema } },
  };
}

const errorResponse = {
  description: 'Error',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/Error' },
    },
  },
};

const paginationParameters = [
  {
    name: 'limit',
    in: 'query',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
  },
  {
    name: 'offset',
    in: 'query',
    schema: { type: 'integer', minimum: 0, default: 0 },
  },
];

const dateRangeParameters = [
  { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
  { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
];

export function buildOpenApiDocument(): Record<string, unknown> {
  const env = getEnv();

  return {
    openapi: '3.1.0',
    info: {
      title: 'SalesTrace Ethiopia API',
      version: '1.0.0',
      description: [
        'B2B SaaS API for influencer campaign attribution and campaign analytics.',
        '',
        'Attribution is association under a declared rule — it does not claim causality or',
        'incrementality. Revenue figures are *attributed net revenue*, not profit.',
        '',
        'All monetary values are decimal strings (for example `"88500.00"`) in the organisation',
        'reporting currency. Rates are numbers rounded half-up to two decimals, or `null` when',
        'the denominator is zero.',
      ].join('\n'),
    },
    servers: [{ url: env.API_BASE_URL, description: 'API server' }],
    tags: [
      { name: 'Auth', description: 'Registration, sessions and password recovery' },
      { name: 'Organizations', description: 'Tenant settings and membership' },
      { name: 'Campaigns', description: 'Campaign lifecycle, creators, costs and performance' },
      { name: 'Creators', description: 'Creator profiles and performance' },
      { name: 'Tracking', description: 'Tracking links, coupon codes and referral events' },
      { name: 'Orders', description: 'Order import and reconciliation' },
      { name: 'Attribution', description: 'Recorded decisions and recomputation' },
      { name: 'Analytics', description: 'Dashboard metrics and exports' },
    ],
    security: [{ sessionCookie: [] }],
    components: {
      securitySchemes: {
        sessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'st_session',
          description: 'The httpOnly session cookie issued by `POST /auth/login`.',
        },
        bearerToken: { type: 'http', scheme: 'bearer' },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['error', 'meta'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                details: {},
              },
            },
            meta: {
              type: 'object',
              required: ['requestId'],
              properties: { requestId: { type: 'string' } },
            },
          },
        },
        Success: {
          type: 'object',
          required: ['data', 'meta'],
          properties: {
            data: {},
            meta: {
              type: 'object',
              required: ['requestId'],
              properties: {
                requestId: { type: 'string' },
                total: { type: 'integer' },
                limit: { type: 'integer' },
                offset: { type: 'integer' },
              },
            },
          },
        },
        Money: {
          type: 'string',
          description: 'A decimal monetary amount, e.g. "88500.00".',
          pattern: '^-?\\d+(\\.\\d{1,2})?$',
        },
        OverviewMetrics: {
          type: 'object',
          properties: {
            totalClicks: { type: 'integer' },
            eligibleClicks: { type: 'integer' },
            attributedOrders: { type: 'integer' },
            attributedValidOrders: { type: 'integer' },
            paidOrders: { type: 'integer' },
            cancelledOrders: { type: 'integer' },
            pendingOrders: { type: 'integer' },
            refundedOrders: { type: 'integer' },
            refundAmount: { $ref: '#/components/schemas/Money' },
            grossAttributedOrderValue: { $ref: '#/components/schemas/Money' },
            netAttributedRevenue: { $ref: '#/components/schemas/Money' },
            campaignCost: { $ref: '#/components/schemas/Money' },
            creatorCost: { $ref: '#/components/schemas/Money' },
            conversionRate: {
              type: ['number', 'null'],
              description: 'attributedValidOrders ÷ eligibleClicks × 100. Null when there are no eligible clicks.',
            },
            costPerAttributedOrder: {
              type: ['string', 'null'],
              description: 'campaignCost ÷ attributedValidOrders. Null when there are no valid orders.',
            },
            roas: {
              type: ['number', 'null'],
              description: 'Attributed net revenue ÷ campaign cost. Null when there is no recorded cost. Not ROI.',
            },
            conflictedAttributions: { type: 'integer' },
          },
        },
      },
    },
    paths: {
      '/api/v1/auth/register': {
        post: {
          summary: 'Create an account',
          tags: ['Auth'],
          security: [],
          requestBody: jsonBody({
            type: 'object',
            required: ['email', 'password'],
            properties: {
              email: { type: 'string', format: 'email' },
              password: { type: 'string', minLength: 10 },
              fullName: { type: 'string' },
            },
          }),
          responses: {
            '201': { description: 'Account created', ...jsonResponse() },
            '409': errorResponse,
            '422': errorResponse,
          },
        } as OperationObject,
      },
      '/api/v1/auth/login': {
        post: {
          summary: 'Sign in and receive the session cookie',
          tags: ['Auth'],
          security: [],
          requestBody: jsonBody({
            type: 'object',
            required: ['email', 'password'],
            properties: {
              email: { type: 'string', format: 'email' },
              password: { type: 'string' },
            },
          }),
          responses: {
            '200': { description: 'Signed in', ...jsonResponse() },
            '401': errorResponse,
            '429': errorResponse,
          },
        } as OperationObject,
      },
      '/api/v1/auth/me': {
        get: {
          summary: 'The current user, organization and role',
          tags: ['Auth'],
          responses: { '200': { description: 'Session information', ...jsonResponse() }, '401': errorResponse },
        } as OperationObject,
      },
      '/api/v1/organizations': {
        post: {
          summary: 'Create an organization (the caller becomes its owner)',
          tags: ['Organizations'],
          requestBody: jsonBody({
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string', minLength: 2, maxLength: 120 },
              slug: { type: 'string' },
              timezone: { type: 'string', default: 'Africa/Addis_Ababa' },
              currency: { type: 'string', default: 'ETB' },
            },
          }),
          responses: { '201': { description: 'Organization created', ...jsonResponse() }, '409': errorResponse },
        } as OperationObject,
      },
      '/api/v1/organizations/current': {
        get: {
          summary: 'The current organization',
          tags: ['Organizations'],
          responses: { '200': { description: 'Organization', ...jsonResponse() }, '404': errorResponse },
        } as OperationObject,
      },
      '/api/v1/campaigns': {
        get: {
          summary: 'List campaigns',
          tags: ['Campaigns'],
          parameters: [
            ...paginationParameters,
            ...dateRangeParameters,
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'creatorId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'search', in: 'query', schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Campaigns', ...jsonResponse() }, '401': errorResponse },
        } as OperationObject,
        post: {
          summary: 'Create a campaign',
          tags: ['Campaigns'],
          requestBody: jsonBody({
            type: 'object',
            required: ['name', 'startAt', 'destinationUrl'],
            properties: {
              name: { type: 'string' },
              objective: { type: 'string' },
              description: { type: 'string' },
              startAt: { type: 'string', format: 'date-time' },
              endAt: { type: ['string', 'null'], format: 'date-time' },
              budget: { $ref: '#/components/schemas/Money' },
              currency: { type: 'string' },
              attributionWindowDays: { type: 'integer', minimum: 1, maximum: 90, default: 7 },
              destinationUrl: { type: 'string', format: 'uri' },
            },
          }),
          responses: { '201': { description: 'Campaign created', ...jsonResponse() }, '422': errorResponse },
        } as OperationObject,
      },
      '/api/v1/campaigns/{campaignId}': {
        get: {
          summary: 'Campaign detail',
          tags: ['Campaigns'],
          parameters: [{ name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Campaign', ...jsonResponse() }, '404': errorResponse },
        } as OperationObject,
        patch: {
          summary: 'Update a campaign',
          tags: ['Campaigns'],
          parameters: [{ name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: jsonBody({ type: 'object' }, false),
          responses: { '200': { description: 'Campaign updated', ...jsonResponse() }, '404': errorResponse },
        } as OperationObject,
      },
      '/api/v1/campaigns/{campaignId}/status': {
        post: {
          summary: 'Change the campaign status',
          description:
            'Legal transitions: draft → active|archived, active → paused|completed|archived, paused → active|completed|archived, completed → archived. Anything else is rejected with 409 INVALID_STATUS_TRANSITION.',
          tags: ['Campaigns'],
          parameters: [{ name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: jsonBody({
            type: 'object',
            required: ['status'],
            properties: { status: { type: 'string', enum: ['draft', 'active', 'paused', 'completed', 'archived'] } },
          }),
          responses: { '200': { description: 'Status changed', ...jsonResponse() }, '409': errorResponse },
        } as OperationObject,
      },
      '/api/v1/orders/imports': {
        post: {
          summary: 'Upload a CSV of orders',
          description:
            'The request body is the raw CSV file with `Content-Type: text/csv`. The file name can be supplied with the `fileName` query parameter. An `Idempotency-Key` header makes repeated uploads of the same file return the same job.',
          tags: ['Orders'],
          requestBody: {
            required: true,
            content: { 'text/csv': { schema: { type: 'string' } } },
          },
          responses: {
            '201': { description: 'Import job created', ...jsonResponse() },
            '413': errorResponse,
            '429': errorResponse,
          },
        } as OperationObject,
      },
      '/api/v1/orders/imports/{importId}/commit': {
        post: {
          summary: 'Import the valid rows and attribute the orders',
          description:
            'Idempotent: committing a completed import again returns the recorded counts and creates no duplicate orders.',
          tags: ['Orders'],
          parameters: [{ name: 'importId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Import committed', ...jsonResponse() }, '404': errorResponse },
        } as OperationObject,
      },
      '/api/v1/analytics/overview': {
        get: {
          summary: 'Headline dashboard metrics',
          tags: ['Analytics'],
          parameters: [...dateRangeParameters, ...paginationParameters],
          responses: {
            '200': {
              description: 'Overview metrics',
              ...jsonResponse({
                type: 'object',
                properties: {
                  range: { type: 'object' },
                  currency: { type: 'string' },
                  metrics: { $ref: '#/components/schemas/OverviewMetrics' },
                },
              }),
            },
            '401': errorResponse,
          },
        } as OperationObject,
      },
      '/api/v1/reports/export': {
        get: {
          summary: 'Export a report as CSV',
          description: 'The export honours exactly the same filters and organization scope as the on-screen report.',
          tags: ['Analytics'],
          parameters: [
            { name: 'type', in: 'query', schema: { type: 'string', enum: ['campaigns', 'creators'] } },
            ...dateRangeParameters,
          ],
          responses: {
            '200': {
              description: 'CSV file',
              content: { 'text/csv': { schema: { type: 'string' } } },
            },
            '401': errorResponse,
          },
        } as OperationObject,
      },
      '/r/{code}': {
        get: {
          summary: 'Public tracking redirect',
          description:
            'Records a referral event and redirects to the campaign destination stored in the database. The destination cannot be influenced by a query parameter.',
          tags: ['Tracking'],
          security: [],
          parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '302': { description: 'Redirect to the campaign destination' },
            '404': { description: 'Unknown or inactive code' },
            '429': errorResponse,
          },
        } as OperationObject,
      },
    },
  };
}

function jsonResponse(schema?: unknown): Record<string, unknown> {
  return {
    content: {
      'application/json': {
        schema: schema ?? { $ref: '#/components/schemas/Success' },
      },
    },
  };
}
