/**
 * Express request augmentation and shared request types.
 */

import type { OrganizationRole } from '@salestrace/shared-types';

export interface RequestAuth {
  profileId: string;
  email: string;
  fullName: string | null;
  emailVerified: boolean;
  organizationId: string;
  role: OrganizationRole;
  /** The opaque session token (kept server-side; never returned to the client). */
  sessionToken: string;
}

/** A resolved session that is not necessarily bound to an organization yet. */
export interface RequestSession {
  profileId: string;
  email: string;
  fullName: string | null;
  emailVerified: boolean;
  organizationId: string | null;
  sessionToken: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
      auth?: RequestAuth;
      session?: RequestSession;
    }
  }
}

export {};
