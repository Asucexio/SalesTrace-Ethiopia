/**
 * Creator repository.
 *
 * All SQL lives here. The repository never decides policy: it receives the organization id from
 * the request context and applies it to every statement.
 *
 * Note on honesty: a creator row carries no follower counts, engagement rates or audience
 * demographics. The platform only stores what a marketer typed in or what a verified integration
 * supplied, so the schema has nowhere to put such numbers.
 */

import type { CreatorStatus } from '@salestrace/shared-types';

import type { SqlClient } from '../../db/driver.js';

export interface CreatorRow {
  id: string;
  organization_id: string;
  internal_code: string;
  display_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  platform: string | null;
  niche: string | null;
  profile_url: string | null;
  audience_location: string | null;
  audience_language: string | null;
  notes: string | null;
  status: CreatorStatus;
  created_at: Date;
  updated_at: Date;
}

export interface CreatorSummaryRow extends CreatorRow {
  campaign_count: number;
}

export interface CreatorSocialAccountRow {
  id: string;
  creator_id: string;
  platform: string;
  handle: string;
  url: string | null;
  is_primary: boolean;
  verified: boolean;
}

export interface CreatorListFilters {
  organizationId: string;
  platform?: string | null;
  niche?: string | null;
  status?: CreatorStatus | null;
  search?: string | null;
  limit: number;
  offset: number;
  sort: string;
}

/** The only sort expressions the API accepts — never interpolated from raw input. */
const SORT_SQL: Readonly<Record<string, string>> = {
  createdAt: 'c.created_at ASC',
  '-createdAt': 'c.created_at DESC',
  displayName: 'c.display_name ASC',
  '-displayName': 'c.display_name DESC',
};

const CREATOR_COLUMNS = `c.id, c.organization_id, c.internal_code, c.display_name, c.contact_email,
       c.contact_phone, c.platform, c.niche, c.profile_url, c.audience_location,
       c.audience_language, c.notes, c.status, c.created_at, c.updated_at`;

const CREATOR_FILTER = `c.organization_id = $1
       AND ($2::text IS NULL OR c.platform = $2)
       AND ($3::text IS NULL OR c.niche = $3)
       AND ($4::text IS NULL OR c.status = $4)
       AND ($5::text IS NULL OR c.display_name ILIKE '%' || $5 || '%' OR c.internal_code ILIKE '%' || $5 || '%')`;

function filterParams(filters: CreatorListFilters): unknown[] {
  return [
    filters.organizationId,
    filters.platform ?? null,
    filters.niche ?? null,
    filters.status ?? null,
    filters.search ?? null,
  ];
}

export const creatorRepository = {
  async list(
    tx: SqlClient,
    filters: CreatorListFilters,
  ): Promise<{ rows: CreatorSummaryRow[]; total: number }> {
    const orderBy = SORT_SQL[filters.sort] ?? SORT_SQL['displayName']!;

    const result = await tx.query<CreatorSummaryRow>(
      `SELECT ${CREATOR_COLUMNS},
              (SELECT count(DISTINCT cc.campaign_id)::int FROM campaign_creators cc
                WHERE cc.creator_id = c.id) AS campaign_count
       FROM creators c
       WHERE ${CREATOR_FILTER}
       ORDER BY ${orderBy}
       LIMIT $6 OFFSET $7`,
      [...filterParams(filters), filters.limit, filters.offset],
    );

    const count = await tx.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM creators c WHERE ${CREATOR_FILTER}`,
      filterParams(filters),
    );

    return { rows: result.rows, total: count.rows[0]?.count ?? 0 };
  },

  async findById(
    tx: SqlClient,
    organizationId: string,
    creatorId: string,
  ): Promise<CreatorSummaryRow | null> {
    const result = await tx.query<CreatorSummaryRow>(
      `SELECT ${CREATOR_COLUMNS},
              (SELECT count(DISTINCT cc.campaign_id)::int FROM campaign_creators cc
                WHERE cc.creator_id = c.id) AS campaign_count
       FROM creators c
       WHERE c.organization_id = $1 AND c.id = $2`,
      [organizationId, creatorId],
    );
    return result.rows[0] ?? null;
  },

  async findByInternalCode(
    tx: SqlClient,
    organizationId: string,
    internalCode: string,
  ): Promise<CreatorRow | null> {
    const result = await tx.query<CreatorRow>(
      `SELECT ${CREATOR_COLUMNS}
       FROM creators c
       WHERE c.organization_id = $1 AND lower(c.internal_code) = lower($2)`,
      [organizationId, internalCode],
    );
    return result.rows[0] ?? null;
  },

  async create(
    tx: SqlClient,
    input: {
      organizationId: string;
      internalCode: string;
      displayName: string;
      contactEmail: string | null;
      contactPhone: string | null;
      platform: string | null;
      niche: string | null;
      profileUrl: string | null;
      audienceLocation: string | null;
      audienceLanguage: string | null;
      notes: string | null;
    },
  ): Promise<CreatorRow> {
    const result = await tx.query<CreatorRow>(
      `INSERT INTO creators (
         organization_id, internal_code, display_name, contact_email, contact_phone, platform,
         niche, profile_url, audience_location, audience_language, notes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, organization_id, internal_code, display_name, contact_email, contact_phone,
                 platform, niche, profile_url, audience_location, audience_language, notes,
                 status, created_at, updated_at`,
      [
        input.organizationId,
        input.internalCode,
        input.displayName,
        input.contactEmail,
        input.contactPhone,
        input.platform,
        input.niche,
        input.profileUrl,
        input.audienceLocation,
        input.audienceLanguage,
        input.notes,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create the creator.');
    return row;
  },

  async update(
    tx: SqlClient,
    organizationId: string,
    creatorId: string,
    patch: {
      internalCode?: string | null;
      displayName?: string | null;
      contactEmail?: string | null;
      contactPhone?: string | null;
      platform?: string | null;
      niche?: string | null;
      profileUrl?: string | null;
      audienceLocation?: string | null;
      audienceLanguage?: string | null;
      notes?: string | null;
      status?: CreatorStatus | null;
    },
  ): Promise<CreatorRow | null> {
    const result = await tx.query<CreatorRow>(
      `UPDATE creators SET
         internal_code = CASE WHEN $3::boolean THEN $4 ELSE internal_code END,
         display_name = CASE WHEN $5::boolean THEN $6 ELSE display_name END,
         contact_email = CASE WHEN $7::boolean THEN $8 ELSE contact_email END,
         contact_phone = CASE WHEN $9::boolean THEN $10 ELSE contact_phone END,
         platform = CASE WHEN $11::boolean THEN $12 ELSE platform END,
         niche = CASE WHEN $13::boolean THEN $14 ELSE niche END,
         profile_url = CASE WHEN $15::boolean THEN $16 ELSE profile_url END,
         audience_location = CASE WHEN $17::boolean THEN $18 ELSE audience_location END,
         audience_language = CASE WHEN $19::boolean THEN $20 ELSE audience_language END,
         notes = CASE WHEN $21::boolean THEN $22 ELSE notes END,
         status = CASE WHEN $23::boolean THEN $24 ELSE status END
       WHERE organization_id = $1 AND id = $2
       RETURNING id, organization_id, internal_code, display_name, contact_email, contact_phone,
                 platform, niche, profile_url, audience_location, audience_language, notes,
                 status, created_at, updated_at`,
      [
        organizationId,
        creatorId,
        patch.internalCode !== undefined,
        patch.internalCode ?? null,
        patch.displayName !== undefined,
        patch.displayName ?? null,
        patch.contactEmail !== undefined,
        patch.contactEmail ?? null,
        patch.contactPhone !== undefined,
        patch.contactPhone ?? null,
        patch.platform !== undefined,
        patch.platform ?? null,
        patch.niche !== undefined,
        patch.niche ?? null,
        patch.profileUrl !== undefined,
        patch.profileUrl ?? null,
        patch.audienceLocation !== undefined,
        patch.audienceLocation ?? null,
        patch.audienceLanguage !== undefined,
        patch.audienceLanguage ?? null,
        patch.notes !== undefined,
        patch.notes ?? null,
        patch.status !== undefined,
        patch.status ?? null,
      ],
    );
    return result.rows[0] ?? null;
  },

  /** Soft delete: the creator becomes inactive. History is never destroyed. */
  async deactivate(
    tx: SqlClient,
    organizationId: string,
    creatorId: string,
  ): Promise<CreatorRow | null> {
    const result = await tx.query<CreatorRow>(
      `UPDATE creators SET status = 'inactive'
       WHERE organization_id = $1 AND id = $2
       RETURNING id, organization_id, internal_code, display_name, contact_email, contact_phone,
                 platform, niche, profile_url, audience_location, audience_language, notes,
                 status, created_at, updated_at`,
      [organizationId, creatorId],
    );
    return result.rows[0] ?? null;
  },

  /* -------------------------------------------------------- social accounts */

  async listSocialAccounts(
    tx: SqlClient,
    organizationId: string,
    creatorId: string,
  ): Promise<CreatorSocialAccountRow[]> {
    const result = await tx.query<CreatorSocialAccountRow>(
      `SELECT sa.id, sa.creator_id, sa.platform, sa.handle, sa.url, sa.is_primary, sa.verified
       FROM creator_social_accounts sa
       WHERE sa.organization_id = $1 AND sa.creator_id = $2
       ORDER BY sa.is_primary DESC, sa.platform ASC, sa.handle ASC`,
      [organizationId, creatorId],
    );
    return result.rows;
  },

  /** Social accounts for a set of creators — used to decorate the list response in one query. */
  async listSocialAccountsForCreators(
    tx: SqlClient,
    organizationId: string,
    creatorIds: readonly string[],
  ): Promise<CreatorSocialAccountRow[]> {
    if (creatorIds.length === 0) return [];
    const result = await tx.query<CreatorSocialAccountRow>(
      `SELECT sa.id, sa.creator_id, sa.platform, sa.handle, sa.url, sa.is_primary, sa.verified
       FROM creator_social_accounts sa
       WHERE sa.organization_id = $1 AND sa.creator_id = ANY($2::uuid[])
       ORDER BY sa.is_primary DESC, sa.platform ASC, sa.handle ASC`,
      [organizationId, [...creatorIds]],
    );
    return result.rows;
  },

  async findSocialAccount(
    tx: SqlClient,
    organizationId: string,
    creatorId: string,
    accountId: string,
  ): Promise<CreatorSocialAccountRow | null> {
    const result = await tx.query<CreatorSocialAccountRow>(
      `SELECT sa.id, sa.creator_id, sa.platform, sa.handle, sa.url, sa.is_primary, sa.verified
       FROM creator_social_accounts sa
       WHERE sa.organization_id = $1 AND sa.creator_id = $2 AND sa.id = $3`,
      [organizationId, creatorId, accountId],
    );
    return result.rows[0] ?? null;
  },

  async createSocialAccount(
    tx: SqlClient,
    input: {
      organizationId: string;
      creatorId: string;
      platform: string;
      handle: string;
      url: string | null;
      isPrimary: boolean;
      verified: boolean;
    },
  ): Promise<CreatorSocialAccountRow> {
    const result = await tx.query<CreatorSocialAccountRow>(
      `INSERT INTO creator_social_accounts (
         organization_id, creator_id, platform, handle, url, is_primary, verified
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, creator_id, platform, handle, url, is_primary, verified`,
      [
        input.organizationId,
        input.creatorId,
        input.platform,
        input.handle,
        input.url,
        input.isPrimary,
        input.verified,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create the social account.');
    return row;
  },

  async deleteSocialAccount(
    tx: SqlClient,
    organizationId: string,
    creatorId: string,
    accountId: string,
  ): Promise<boolean> {
    const result = await tx.query(
      'DELETE FROM creator_social_accounts WHERE organization_id = $1 AND creator_id = $2 AND id = $3',
      [organizationId, creatorId, accountId],
    );
    return result.rowCount > 0;
  },

  /** The number of campaigns the creator is assigned to. */
  async countCampaigns(
    tx: SqlClient,
    organizationId: string,
    creatorId: string,
  ): Promise<number> {
    const result = await tx.query<{ count: number }>(
      `SELECT count(DISTINCT cc.campaign_id)::int AS count
       FROM campaign_creators cc
       WHERE cc.organization_id = $1 AND cc.creator_id = $2`,
      [organizationId, creatorId],
    );
    return result.rows[0]?.count ?? 0;
  },
};
