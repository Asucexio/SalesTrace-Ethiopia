/**
 * Typed HTTP client for the SalesTrace API.
 *
 * Every request is made **same-origin** to `/api/v1/...`; the Next.js rewrite proxy forwards
 * it to the API server, so the `st_session` cookie stays first-party and no CORS pre-flight
 * is ever needed.
 *
 * The API answers with the envelope `{ data, meta }` on success and
 * `{ error: { code, message, details }, meta }` on failure.
 */

import type {
  ApiMeta,
  Attribution,
  AuditEvent,
  Campaign,
  CampaignCreatorAssignment,
  CampaignCost,
  CampaignPerformance,
  Creator,
  CreatorPerformance,
  CreatorSocialAccount,
  CouponCode,
  ImportJob,
  ImportJobRow,
  Order,
  Organization,
  OrganizationMember,
  OverviewMetrics,
  Paginated,
  SessionInfo,
  TimeSeriesPoint,
  TrackingEvent,
  TrackingLink,
  UserProfile,
} from '@salestrace/shared-types';
import type {
  AssignCreatorInput,
  CreateCampaignCostInput,
  CreateCampaignInput,
  CreateCreatorInput,
  CreateOrganizationInput,
  CreateTrackingLinkInput,
  CreateCouponCodeInput,
  InviteMemberInput,
  LoginInput,
  RegisterInput,
  UpdateCampaignInput,
  UpdateCreatorInput,
} from '@salestrace/validation';

/** Base path of the API, relative to the current origin. */
export const API_BASE_PATH = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1';

/** A failure returned by the API. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(message: string, options: { code: string; status: number; details?: unknown }) {
    super(message);
    this.name = 'ApiError';
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
  }

  /** True when the request was rejected because the session is missing or expired. */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }

  /** True when the request was rejected because of the caller's role. */
  get isForbidden(): boolean {
    return this.status === 403;
  }
}

export type QueryValue = string | number | boolean | null | undefined | Array<string | number>;

export type QueryParams = Record<string, QueryValue>;

export interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** JSON body. Serialised with `JSON.stringify`. */
  body?: unknown;
  /** Raw request body. Used for the CSV order upload (`Content-Type: text/csv`). */
  rawBody?: string | Blob | ArrayBuffer | FormData;
  /** Content type used together with `rawBody`. */
  contentType?: string;
  query?: QueryParams;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Do not redirect to `/login` on a 401 (used by the auth screens and the session probe). */
  skipAuthRedirect?: boolean;
  /** `Idempotency-Key` header. */
  idempotencyKey?: string;
}

export interface ApiEnvelope<T> {
  data: T;
  meta: ApiMeta;
}

const AUTH_PAGES = ['/login', '/signup', '/forgot-password', '/reset-password', '/onboarding'];

function isAuthPage(): boolean {
  if (typeof window === 'undefined') return false;
  return AUTH_PAGES.some((path) => window.location.pathname.startsWith(path));
}

function buildQuery(query?: QueryParams): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry === undefined || entry === null || entry === '') continue;
        params.append(key, String(entry));
      }
      continue;
    }
    params.append(key, String(value));
  }
  const serialised = params.toString();
  return serialised ? `?${serialised}` : '';
}

function buildUrl(path: string, query?: QueryParams): string {
  const normalised = path.startsWith('/') ? path : `/${path}`;
  const withBase = normalised.startsWith('/api/') || normalised === '/api'
    ? normalised
    : `${API_BASE_PATH}${normalised}`;
  return `${withBase}${buildQuery(query)}`;
}

async function readError(response: Response): Promise<ApiError> {
  let code = 'UNKNOWN_ERROR';
  let message = `Request failed with status ${response.status}.`;
  let details: unknown;

  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string; details?: unknown };
    };
    if (body?.error) {
      if (typeof body.error.code === 'string') code = body.error.code;
      if (typeof body.error.message === 'string') message = body.error.message;
      details = body.error.details;
    }
  } catch {
    // Non-JSON error body (e.g. an HTML error page from a proxy) — keep the generic message.
  }

  return new ApiError(message, { code, status: response.status, details });
}

function redirectToLogin(): void {
  if (typeof window === 'undefined') return;
  if (isAuthPage()) return;
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}

/**
 * Perform a request and return the full `{ data, meta }` envelope.
 */
export async function apiRequest<T>(path: string, options: ApiFetchOptions = {}): Promise<ApiEnvelope<T>> {
  const {
    method = 'GET',
    body,
    rawBody,
    contentType,
    query,
    signal,
    headers = {},
    skipAuthRedirect = false,
    idempotencyKey,
  } = options;

  const requestHeaders: Record<string, string> = { Accept: 'application/json', ...headers };
  if (idempotencyKey) requestHeaders['Idempotency-Key'] = idempotencyKey;

  let payload: BodyInit | undefined;
  if (rawBody !== undefined) {
    payload = rawBody as BodyInit;
    requestHeaders['Content-Type'] = contentType ?? 'text/csv';
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    requestHeaders['Content-Type'] = 'application/json';
  }

  const response = await fetch(buildUrl(path, query), {
    method,
    headers: requestHeaders,
    body: payload,
    credentials: 'include',
    signal,
  });

  if (!response.ok) {
    const error = await readError(response);
    if (error.status === 401 && !skipAuthRedirect) redirectToLogin();
    throw error;
  }

  if (response.status === 204) {
    return { data: undefined as T, meta: { requestId: '' } };
  }

  const text = await response.text();
  if (!text) {
    return { data: undefined as T, meta: { requestId: '' } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiError('The server returned a response that could not be parsed.', {
      code: 'INVALID_RESPONSE',
      status: response.status,
    });
  }

  const envelope = parsed as Partial<ApiEnvelope<T>>;
  if (envelope && typeof envelope === 'object' && 'data' in envelope) {
    return {
      data: envelope.data as T,
      meta: envelope.meta ?? { requestId: '' },
    };
  }

  // Tolerate a bare payload (no envelope).
  return { data: parsed as T, meta: { requestId: '' } };
}

/**
 * Perform a request and return only the `data` part of the envelope.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const envelope = await apiRequest<T>(path, options);
  return envelope.data;
}

/**
 * Normalise a list payload into {@link Paginated}.
 *
 * The API may return the collection either as a bare array or as `{ items, total, limit,
 * offset }`; both are accepted and the envelope metadata is used as a fallback.
 */
export function toPaginated<T>(data: unknown, meta: ApiMeta): Paginated<T> {
  if (Array.isArray(data)) {
    return {
      items: data as T[],
      total: meta.total ?? data.length,
      limit: meta.limit ?? data.length,
      offset: meta.offset ?? 0,
    };
  }

  const record = (data ?? {}) as Partial<Paginated<T>>;
  const items = Array.isArray(record.items) ? (record.items as T[]) : [];
  return {
    items,
    total: record.total ?? meta.total ?? items.length,
    limit: record.limit ?? meta.limit ?? items.length,
    offset: record.offset ?? meta.offset ?? 0,
  };
}

/**
 * Perform a list request and return a normalised {@link Paginated} result.
 */
export async function apiList<T>(
  path: string,
  query?: QueryParams,
  options: Omit<ApiFetchOptions, 'query'> = {},
): Promise<Paginated<T>> {
  const envelope = await apiRequest<unknown>(path, { ...options, query });
  return toPaginated<T>(envelope.data, envelope.meta);
}

/* ------------------------------------------------------------------ helpers */

/** Build a query string for a report export and trigger a browser download. */
export async function downloadCsv(
  path: string,
  query: QueryParams,
  fileName: string,
): Promise<void> {
  const response = await fetch(buildUrl(path, query), {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'text/csv' },
  });

  if (!response.ok) {
    const error = await readError(response);
    if (error.status === 401) redirectToLogin();
    throw error;
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}

/**
 * Upload an order CSV.
 *
 * The API accepts the **raw CSV body** with `Content-Type: text/csv` (not `multipart/form-data`).
 * If the API answers with `415 UNSUPPORTED_MEDIA_TYPE` or `400 BAD_REQUEST` — i.e. the
 * deployment expects a multipart upload — the call transparently falls back to
 * `multipart/form-data` so the wizard still works.
 */
export async function uploadOrderCsv(
  file: File,
  options: { signal?: AbortSignal; idempotencyKey?: string } = {},
): Promise<ImportUploadResponse> {
  const text = await file.text();
  const headers: Record<string, string> = { 'X-File-Name': file.name };
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  try {
    const data = await apiFetch<ImportUploadResponse>('/orders/imports', {
      method: 'POST',
      rawBody: text,
      contentType: 'text/csv',
      headers,
      signal: options.signal,
    });
    return data;
  } catch (error) {
    const isMediaTypeProblem =
      error instanceof ApiError && (error.status === 415 || error.status === 400);
    if (!isMediaTypeProblem) throw error;

    const form = new FormData();
    form.append('file', file, file.name);
    return apiFetch<ImportUploadResponse>('/orders/imports', {
      method: 'POST',
      rawBody: form,
      signal: options.signal,
    });
  }
}

/* --------------------------------------------------------------- endpoints */

export const api = {
  auth: {
    register: (input: RegisterInput) =>
      apiFetch<UserProfile>('/auth/register', {
        method: 'POST',
        body: input,
        skipAuthRedirect: true,
      }),

    login: (input: LoginInput) =>
      apiFetch<SessionInfo>('/auth/login', {
        method: 'POST',
        body: input,
        skipAuthRedirect: true,
      }),

    logout: () => apiFetch<void>('/auth/logout', { method: 'POST' }),

    me: () => apiFetch<SessionInfo>('/auth/me', { skipAuthRedirect: true }),

    verifyEmail: (token: string) =>
      apiFetch<void>('/auth/verify-email', {
        method: 'POST',
        body: { token },
        skipAuthRedirect: true,
      }),

    forgotPassword: (email: string) =>
      apiFetch<void>('/auth/forgot-password', {
        method: 'POST',
        body: { email },
        skipAuthRedirect: true,
      }),

    resetPassword: (token: string, newPassword: string) =>
      apiFetch<void>('/auth/reset-password', {
        method: 'POST',
        body: { token, newPassword },
        skipAuthRedirect: true,
      }),

    switchOrganization: (organizationId: string) =>
      apiFetch<SessionInfo>('/auth/switch-organization', {
        method: 'POST',
        body: { organizationId },
      }),
  },

  organizations: {
    create: (input: CreateOrganizationInput) =>
      apiFetch<Organization>('/organizations', { method: 'POST', body: input }),

    current: () => apiFetch<Organization>('/organizations/current'),

    update: (body: Partial<Pick<Organization, 'name' | 'timezone' | 'currency' | 'settings'>>) =>
      apiFetch<Organization>('/organizations/current', { method: 'PATCH', body }),

    members: () => apiList<OrganizationMember>('/organizations/current/members'),

    inviteMember: (input: InviteMemberInput) =>
      apiFetch<OrganizationMember>('/organizations/current/members', {
        method: 'POST',
        body: input,
      }),

    updateMember: (memberId: string, body: { role?: string; status?: string }) =>
      apiFetch<OrganizationMember>(`/organizations/current/members/${memberId}`, {
        method: 'PATCH',
        body,
      }),

    removeMember: (memberId: string) =>
      apiFetch<void>(`/organizations/current/members/${memberId}`, { method: 'DELETE' }),

    acceptInvitation: (token: string) =>
      apiFetch<void>('/organizations/accept-invitation', {
        method: 'POST',
        body: { token },
      }),

    auditEvents: (query?: QueryParams) =>
      apiList<AuditEvent>('/organizations/current/audit-events', query),
  },

  campaigns: {
    list: (query?: QueryParams) => apiList<Campaign>('/campaigns', query),
    create: (input: CreateCampaignInput) => apiFetch<Campaign>('/campaigns', { method: 'POST', body: input }),
    get: (campaignId: string) => apiFetch<Campaign>(`/campaigns/${campaignId}`),
    update: (campaignId: string, input: UpdateCampaignInput) =>
      apiFetch<Campaign>(`/campaigns/${campaignId}`, { method: 'PATCH', body: input }),
    setStatus: (campaignId: string, status: string) =>
      apiFetch<Campaign>(`/campaigns/${campaignId}/status`, { method: 'POST', body: { status } }),
    archive: (campaignId: string) =>
      apiFetch<Campaign>(`/campaigns/${campaignId}/archive`, { method: 'POST' }),
    creators: (campaignId: string) =>
      apiList<CampaignCreatorAssignment>(`/campaigns/${campaignId}/creators`),
    assignCreator: (campaignId: string, input: AssignCreatorInput) =>
      apiFetch<CampaignCreatorAssignment>(`/campaigns/${campaignId}/creators`, {
        method: 'POST',
        body: input,
      }),
    updateAssignment: (
      campaignId: string,
      creatorId: string,
      body: { agreedFee?: string | null; assignedAt?: string; notes?: string | null; status?: string },
    ) =>
      apiFetch<CampaignCreatorAssignment>(`/campaigns/${campaignId}/creators/${creatorId}`, {
        method: 'PATCH',
        body,
      }),
    removeCreator: (campaignId: string, creatorId: string) =>
      apiFetch<void>(`/campaigns/${campaignId}/creators/${creatorId}`, { method: 'DELETE' }),
    costs: (campaignId: string) => apiList<CampaignCost>(`/campaigns/${campaignId}/costs`),
    addCost: (campaignId: string, input: CreateCampaignCostInput, idempotencyKey?: string) =>
      apiFetch<CampaignCost>(`/campaigns/${campaignId}/costs`, {
        method: 'POST',
        body: input,
        idempotencyKey,
      }),
    deleteCost: (campaignId: string, costId: string) =>
      apiFetch<void>(`/campaigns/${campaignId}/costs/${costId}`, { method: 'DELETE' }),
    performance: (campaignId: string) =>
      apiFetch<CampaignPerformance>(`/campaigns/${campaignId}/performance`),
    orders: (campaignId: string, query?: QueryParams) =>
      apiList<Order>(`/campaigns/${campaignId}/orders`, query),
    attributions: (campaignId: string, query?: QueryParams) =>
      apiList<Attribution>(`/campaigns/${campaignId}/attributions`, query),
  },

  creators: {
    list: (query?: QueryParams) => apiList<Creator>('/creators', query),
    create: (input: CreateCreatorInput) => apiFetch<Creator>('/creators', { method: 'POST', body: input }),
    get: (creatorId: string) => apiFetch<Creator>(`/creators/${creatorId}`),
    update: (creatorId: string, input: UpdateCreatorInput) =>
      apiFetch<Creator>(`/creators/${creatorId}`, { method: 'PATCH', body: input }),
    deactivate: (creatorId: string) => apiFetch<Creator>(`/creators/${creatorId}`, { method: 'DELETE' }),
    socialAccounts: (creatorId: string) =>
      apiList<CreatorSocialAccount>(`/creators/${creatorId}/social-accounts`),
    addSocialAccount: (
      creatorId: string,
      body: {
        platform: string;
        handle: string;
        url?: string | null;
        isPrimary?: boolean;
        verified?: boolean;
      },
    ) =>
      apiFetch<CreatorSocialAccount>(`/creators/${creatorId}/social-accounts`, {
        method: 'POST',
        body,
      }),
    removeSocialAccount: (creatorId: string, accountId: string) =>
      apiFetch<void>(`/creators/${creatorId}/social-accounts/${accountId}`, { method: 'DELETE' }),
    performance: (creatorId: string) => apiFetch<CreatorPerformance>(`/creators/${creatorId}/performance`),
  },

  tracking: {
    links: (query?: QueryParams) => apiList<TrackingLink>('/tracking-links', query),
    createLink: (input: CreateTrackingLinkInput) =>
      apiFetch<TrackingLink>('/tracking-links', { method: 'POST', body: input }),
    getLink: (linkId: string) => apiFetch<TrackingLink>(`/tracking-links/${linkId}`),
    updateLink: (linkId: string, body: { label?: string | null; destinationUrl?: string; isActive?: boolean }) =>
      apiFetch<TrackingLink>(`/tracking-links/${linkId}`, { method: 'PATCH', body }),
    deleteLink: (linkId: string) => apiFetch<void>(`/tracking-links/${linkId}`, { method: 'DELETE' }),
    qrCodeUrl: (linkId: string) => `${API_BASE_PATH}/tracking-links/${linkId}/qrcode`,

    coupons: (query?: QueryParams) => apiList<CouponCode>('/coupon-codes', query),
    createCoupon: (input: CreateCouponCodeInput) =>
      apiFetch<CouponCode>('/coupon-codes', { method: 'POST', body: input }),
    updateCoupon: (
      couponId: string,
      body: {
        discountType?: string;
        discountValue?: string | null;
        discountPercent?: number | null;
        maxRedemptions?: number | null;
        validFrom?: string | null;
        validUntil?: string | null;
        isActive?: boolean;
      },
    ) => apiFetch<CouponCode>(`/coupon-codes/${couponId}`, { method: 'PATCH', body }),
    deleteCoupon: (couponId: string) => apiFetch<void>(`/coupon-codes/${couponId}`, { method: 'DELETE' }),

    events: (query?: QueryParams) => apiList<TrackingEvent>('/tracking-events', query),
  },

  orders: {
    list: (query?: QueryParams) => apiList<Order>('/orders', query),
    get: (orderId: string) => apiFetch<Order>(`/orders/${orderId}`),
    recordRefund: (
      orderId: string,
      body: { amount: string; reason?: string | null; externalRefundId?: string | null; refundedAt?: string },
    ) => apiFetch<Order>(`/orders/${orderId}/refunds`, { method: 'POST', body }),
    attribution: (orderId: string) => apiFetch<Attribution>(`/orders/${orderId}/attribution`),

    imports: (query?: QueryParams) => apiList<ImportJob>('/orders/imports', query),
    upload: uploadOrderCsv,
    getImport: (importId: string) =>
      apiFetch<ImportJob & { rows?: ImportJobRow[] }>(`/orders/imports/${importId}`),
    setMapping: (importId: string, mapping: Record<string, string>) =>
      apiFetch<ImportJob>(`/orders/imports/${importId}/mapping`, { method: 'PUT', body: { mapping } }),
    preview: (importId: string) =>
      apiFetch<ImportPreview>(`/orders/imports/${importId}/preview`, { method: 'POST' }),
    commit: (importId: string) =>
      apiFetch<ImportCommitSummary>(`/orders/imports/${importId}/commit`, { method: 'POST' }),
    errorsCsvUrl: (importId: string) => `${API_BASE_PATH}/orders/imports/${importId}/errors.csv`,
  },

  attribution: {
    list: (query?: QueryParams) => apiList<Attribution>('/attributions', query),
    get: (attributionId: string) => apiFetch<Attribution>(`/attributions/${attributionId}`),
    recompute: (campaignId?: string) =>
      apiFetch<RecomputeSummary>('/attribution/recompute', {
        method: 'POST',
        body: campaignId ? { campaignId } : {},
      }),
    rules: () => apiFetch<AttributionRules>('/attribution/rules'),
  },

  analytics: {
    overview: (query?: QueryParams) => apiFetch<OverviewResponse>('/analytics/overview', { query }),
    campaigns: (query?: QueryParams) => apiList<CampaignPerformance>('/analytics/campaigns', query),
    creators: (query?: QueryParams) => apiList<CreatorPerformance>('/analytics/creators', query),
    timeseries: (query?: QueryParams) => apiList<TimeSeriesPoint>('/analytics/timeseries', query),
  },

  reports: {
    campaigns: (query?: QueryParams) => apiList<ReportRow>('/reports/campaigns', query),
    // The export must carry the same filters as the on-screen report, otherwise the downloaded
    // file would not match what the user is looking at.
    export: (query: QueryParams) => buildUrl('/reports/export', query),
  },
} as const;

/* ------------------------------------------------------------------ shapes */

export interface OverviewResponse {
  range: { from: string; to: string };
  currency: string;
  metrics: OverviewMetrics;
}

export interface RecomputeSummary {
  campaignId: string | null;
  ruleVersion: string;
  ordersEvaluated: number;
  attributed: number;
  updated: number;
  unattributed: number;
}

export interface AttributionRules {
  version: string;
  windowDays: number;
  configuration: Record<string, unknown>;
}

export interface ImportUploadResponse {
  importId: string;
  status: string;
  fileName: string;
  detectedColumns: string[];
  totalRows: number;
}

export interface ImportPreviewRow {
  rowNumber: number;
  externalOrderId?: string | null;
  status?: string;
  errors?: Array<{ code: string; message: string; field?: string }>;
  warnings?: Array<{ code: string; message: string; field?: string }>;
  data?: Record<string, unknown>;
  rawData?: Record<string, unknown>;
}

export interface ImportPreview {
  totalRows?: number;
  validRows?: number;
  invalidRows?: number;
  sampleValid?: ImportPreviewRow[];
  sampleInvalid?: ImportPreviewRow[];
  valid?: ImportPreviewRow[];
  invalid?: ImportPreviewRow[];
  rows?: ImportPreviewRow[];
  errors?: Array<{ code: string; message: string; field?: string; rowNumber?: number }>;
}

export interface ImportCommitSummary {
  importId: string;
  status: string;
  totalRows: number;
  importedRows: number;
  updatedRows: number;
  skippedRows: number;
  invalidRows: number;
  attributedOrders?: number;
  errorReportUrl?: string | null;
}

export interface ReportRow {
  [key: string]: unknown;
}
