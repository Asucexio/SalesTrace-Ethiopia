/**
 * The Express application.
 *
 * Middleware order matters:
 *   request id → security headers → CORS → body parsing → CSRF → rate limits → routes → errors
 *
 * The authentication middleware runs per route group, not globally, so the public tracking
 * endpoint and the authentication endpoints stay reachable without a session.
 */

import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';

import { getEnv } from './config/env.js';
import { createOrganizationSchema, switchOrganizationSchema } from '@salestrace/validation';
import { createAuthMiddleware, createSessionMiddleware } from './middleware/auth.js';
import { createCsrfGuard } from './middleware/csrf.js';
import { validate } from './middleware/validate.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { apiRateLimiter, trackingRateLimiter } from './middleware/rate-limit.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { createAnalyticsRoutes } from './modules/analytics/analytics.routes.js';
import { createAttributionRoutes } from './modules/attribution/attribution.routes.js';
import { createAuthRoutes } from './modules/auth/auth.routes.js';
import { createCampaignRoutes } from './modules/campaigns/campaign.routes.js';
import { createCreatorRoutes } from './modules/creators/creator.routes.js';
import { createOrganizationRoutes } from './modules/organizations/organization.routes.js';
import { createOrganizationController } from './modules/organizations/organization.controller.js';
import { createOrderRoutes } from './modules/orders/order.routes.js';
import { createPublicTrackingRoutes, createTrackingRoutes } from './modules/tracking/tracking.routes.js';
import { parseCookies } from './shared/cookies.js';
import { sendData } from './shared/response.js';
import type { AppContainer } from './container.js';
import { buildOpenApiDocument } from './openapi.js';

/** Attach the parsed cookies to the request (a small, focused replacement for cookie-parser). */
function cookieMiddleware(req: Request, _res: Response, next: NextFunction): void {
  (req as Request & { cookies: Record<string, string> }).cookies = parseCookies(req.header('cookie'));
  next();
}

export function createApp(container: AppContainer): Express {
  const env = getEnv();
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestIdMiddleware);
  app.use(
    helmet({
      // The API serves JSON and an SVG QR code; a strict CSP does not add value here and would
      // interfere with Swagger UI.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  app.use(
    cors({
      origin: env.CORS_ALLOWED_ORIGINS.length > 0 ? env.CORS_ALLOWED_ORIGINS : false,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      maxAge: 10,
    }),
  );

  app.use(cookieMiddleware);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  // --- health ------------------------------------------------------------
  app.get('/api/v1/health', (_req, res) => {
    res.status(200).json({ data: { status: 'ok' }, meta: { requestId: 'health' } });
  });

  app.get('/api/v1/health/ready', async (_req, res) => {
    try {
      await container.db.query('SELECT 1');
      res.status(200).json({ data: { status: 'ready', database: 'up' }, meta: { requestId: 'health' } });
    } catch {
      res.status(503).json({
        error: { code: 'INTERNAL_ERROR', message: 'The database is not reachable.' },
        meta: { requestId: 'health' },
      });
    }
  });

  // --- public tracking ---------------------------------------------------
  // Mounted at the application root so that tracking links live on the brand's domain.
  app.use('/r', trackingRateLimiter, createPublicTrackingRoutes(container.tracking));

  // --- API ----------------------------------------------------------------
  const api = express.Router();

  api.use('/v1/auth', createAuthRoutes(container.auth));

  const authDeps = {
    sessionService: container.sessions,
    resolveMembership: (organizationId: string, profileId: string) =>
      container.auth.resolveMembership(organizationId, profileId),
  };

  api.use(apiRateLimiter);
  api.use(createCsrfGuard());

  // Switching the active organization resolves the session itself: the target organization is
  // not necessarily the one the session currently points at.
  api.post(
    '/v1/auth/switch-organization',
    createSessionMiddleware(authDeps),
    validate({ body: switchOrganizationSchema }),
    (req, res, next) => {
      container.auth
        .switchOrganization(req.session?.sessionToken ?? '', (req.body as { organizationId: string }).organizationId)
        .then((info) => sendData(res, info))
        .catch(next);
    },
  );

  // Creating the first organization happens before the session can name one, so it resolves the
  // session without requiring an organization. The rest of the organization routes are mounted
  // below the full authentication middleware.
  const organizationController = createOrganizationController(container.organizations, container.sessions);
  api.post(
    '/v1/organizations',
    createSessionMiddleware(authDeps),
    validate({ body: createOrganizationSchema }),
    (req, res, next) => {
      organizationController.create(req, res).catch(next);
    },
  );

  // Everything below this line requires an authenticated session **and** an active organization.
  api.use(createAuthMiddleware(authDeps));

  api.use('/v1/organizations', createOrganizationRoutes(container.organizations, container.sessions));
  api.use('/v1/orders', createOrderRoutes({ imports: container.orderImports, db: container.db }));
  api.use(
    '/v1',
    createAttributionRoutes({ db: container.db, service: container.attribution }),
  );
  api.use('/v1', createAnalyticsRoutes({ service: container.analytics }));

  // Campaign, creator and tracking routes.
  api.use('/v1/campaigns', createCampaignRoutes(container.campaigns));
  api.use('/v1/creators', createCreatorRoutes(container.creators));
  api.use('/v1', createTrackingRoutes(container.tracking));

  api.get('/v1/openapi.json', (_req, res) => {
    res.status(200).json(buildOpenApiDocument());
  });

  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
