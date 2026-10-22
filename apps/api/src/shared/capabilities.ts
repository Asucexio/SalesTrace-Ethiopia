/**
 * Capability-based authorisation.
 *
 * Route handlers declare the capability they need; the middleware rejects the request before
 * the handler runs. The client uses the same matrix to hide affordances, but the server is the
 * only authority.
 */

import type { OrganizationRole } from '@salestrace/shared-types';

export type Capability =
  | 'campaign:read'
  | 'campaign:write'
  | 'creator:read'
  | 'creator:write'
  | 'tracking:read'
  | 'tracking:write'
  | 'order:read'
  | 'order:write'
  | 'attribution:read'
  | 'attribution:write'
  | 'report:read'
  | 'member:read'
  | 'member:write'
  | 'org:read'
  | 'org:write'
  | 'audit:read';

export const CAPABILITIES_BY_ROLE: Readonly<Record<OrganizationRole, readonly Capability[]>> = {
  owner: [
    'campaign:read',
    'campaign:write',
    'creator:read',
    'creator:write',
    'tracking:read',
    'tracking:write',
    'order:read',
    'order:write',
    'attribution:read',
    'attribution:write',
    'report:read',
    'member:read',
    'member:write',
    'org:read',
    'org:write',
    'audit:read',
  ],
  admin: [
    'campaign:read',
    'campaign:write',
    'creator:read',
    'creator:write',
    'tracking:read',
    'tracking:write',
    'order:read',
    'order:write',
    'attribution:read',
    'attribution:write',
    'report:read',
    'member:read',
    'org:read',
    'audit:read',
  ],
  marketer: [
    'campaign:read',
    'campaign:write',
    'creator:read',
    'creator:write',
    'tracking:read',
    'tracking:write',
    'order:read',
    'order:write',
    'attribution:read',
    'attribution:write',
    'report:read',
    'member:read',
    'org:read',
  ],
  analyst: [
    'campaign:read',
    'creator:read',
    'tracking:read',
    'order:read',
    'attribution:read',
    'report:read',
    'member:read',
    'org:read',
  ],
};

export function roleHasCapability(role: OrganizationRole, capability: Capability): boolean {
  return CAPABILITIES_BY_ROLE[role].includes(capability);
}
