'use client';

/**
 * Session context.
 *
 * Fetches `GET /api/v1/auth/me` once on mount and exposes the current user, the active
 * organization and the role of the signed-in user in that organization.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Organization, OrganizationRole, SessionInfo, UserProfile } from '@salestrace/shared-types';

import { api, ApiError } from './api';

export interface SessionContextValue {
  user: UserProfile | null;
  organization: Organization | null;
  role: OrganizationRole | null;
  memberships: SessionInfo['memberships'];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  switchOrganization: (organizationId: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [role, setRole] = useState<OrganizationRole | null>(null);
  const [memberships, setMemberships] = useState<SessionInfo['memberships']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const info = await api.auth.me();
      setUser(info.user);
      setOrganization(info.organization);
      setRole(info.role);
      setMemberships(info.memberships ?? []);
    } catch (cause) {
      setUser(null);
      setOrganization(null);
      setRole(null);
      setMemberships([]);
      if (cause instanceof ApiError && cause.status === 401) {
        // Not signed in — this is an expected state, not an error.
        setError(null);
      } else {
        setError(cause instanceof Error ? cause.message : 'Could not load your session.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const switchOrganization = useCallback(async (organizationId: string) => {
    const info = await api.auth.switchOrganization(organizationId);
    setUser(info.user);
    setOrganization(info.organization);
    setRole(info.role);
    setMemberships(info.memberships ?? []);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // Signing out locally is still the right outcome if the server call fails.
    }
    setUser(null);
    setOrganization(null);
    setRole(null);
    setMemberships([]);
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ user, organization, role, memberships, loading, error, refresh, switchOrganization, signOut }),
    [user, organization, role, memberships, loading, error, refresh, switchOrganization, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used inside a <SessionProvider>.');
  }
  return context;
}

/** True when the signed-in user may create/edit resources. */
export function canWrite(role: OrganizationRole | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'marketer';
}

/** True when the signed-in user may manage the organization and its members. */
export function canManage(role: OrganizationRole | null): boolean {
  return role === 'owner' || role === 'admin';
}

/** True when the signed-in user may view the audit trail. */
export function canViewAudit(role: OrganizationRole | null): boolean {
  return role === 'owner' || role === 'admin';
}
