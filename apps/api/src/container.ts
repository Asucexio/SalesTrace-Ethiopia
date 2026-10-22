/**
 * The application container.
 *
 * Builds the database driver, the identity provider, the services and the controllers once and
 * hands them to the route factories. Dependency injection keeps the modules testable: the
 * integration suite builds the same container against PGlite.
 */

import { getEnv } from './config/env.js';
import type { DbDriver } from './db/driver.js';
import { PgDriver } from './db/pg-driver.js';
import type { AuthProvider } from './modules/auth/auth.provider.js';
import { LocalAuthProvider } from './modules/auth/local-auth.provider.js';
import { SupabaseAuthProvider } from './modules/auth/supabase-auth.provider.js';
import { AuthService } from './modules/auth/auth.service.js';
import { SessionService } from './modules/auth/session.service.js';
import { OrganizationService } from './modules/organizations/organization.service.js';
import { AttributionService } from './modules/attribution/attribution.service.js';
import { OrderImportService } from './modules/orders/order-import.service.js';
import { AnalyticsService } from './modules/analytics/analytics.service.js';
import { CampaignService } from './modules/campaigns/campaign.service.js';
import { CreatorService } from './modules/creators/creator.service.js';
import { TrackingService } from './modules/tracking/tracking.service.js';
import { createFileStorage, type FileStorage } from './shared/storage.js';

export interface AppContainer {
  db: DbDriver;
  storage: FileStorage;
  auth: AuthService;
  sessions: SessionService;
  provider: AuthProvider;
  organizations: OrganizationService;
  attribution: AttributionService;
  orderImports: OrderImportService;
  analytics: AnalyticsService;
  campaigns: CampaignService;
  creators: CreatorService;
  tracking: TrackingService;
  close(): Promise<void>;
}

export interface CreateContainerOptions {
  db?: DbDriver;
  storage?: FileStorage;
}

export function createContainer(options: CreateContainerOptions = {}): AppContainer {
  const env = getEnv();
  const db = options.db ?? new PgDriver();
  const storage = options.storage ?? createFileStorage();

  const provider: AuthProvider =
    env.AUTH_MODE === 'supabase' ? new SupabaseAuthProvider() : new LocalAuthProvider(db);

  const sessions = new SessionService(db);
  const auth = new AuthService({ db, provider, sessions });
  const organizations = new OrganizationService({ db });
  const attribution = new AttributionService();

  const orderImports = new OrderImportService({
    db,
    storage,
    attributeOrder: (tx, input) => attribution.attributeOrder(tx, input),
  });

  const analytics = new AnalyticsService(db);

  const campaigns = new CampaignService({ db });
  const creators = new CreatorService({ db });
  const tracking = new TrackingService({ db });

  return {
    db,
    storage,
    auth,
    sessions,
    provider,
    organizations,
    attribution,
    orderImports,
    analytics,
    campaigns,
    creators,
    tracking,
    async close(): Promise<void> {
      await db.close();
    },
  };
}
