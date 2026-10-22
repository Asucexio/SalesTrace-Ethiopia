'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { CAMPAIGN_STATUS_TRANSITIONS, type CampaignStatus } from '@salestrace/shared-types';

import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

const TRANSITION_LABEL: Record<CampaignStatus, string> = {
  draft: 'Back to draft',
  active: 'Activate',
  paused: 'Pause',
  completed: 'Complete',
  archived: 'Archive',
};

/**
 * Buttons for the legal status transitions of a campaign.
 *
 * Only transitions allowed by `CAMPAIGN_STATUS_TRANSITIONS` are offered. Archiving asks for
 * confirmation because it is terminal.
 */
export function CampaignStatusActions({
  campaignId,
  status,
  onChanged,
  canWrite,
}: {
  campaignId: string;
  status: CampaignStatus;
  onChanged: () => void;
  canWrite: boolean;
}) {
  const [busy, setBusy] = React.useState(false);
  const [confirmArchive, setConfirmArchive] = React.useState(false);

  const nextStatuses = CAMPAIGN_STATUS_TRANSITIONS[status] ?? [];

  async function transition(target: CampaignStatus) {
    setBusy(true);
    try {
      await api.campaigns.setStatus(campaignId, target);
      toast.success(`Campaign ${target === 'archived' ? 'archived' : `moved to ${target}`}`);
      setConfirmArchive(false);
      onChanged();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'We could not change the campaign status.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (!canWrite || nextStatuses.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {nextStatuses
        .filter((target) => target !== 'archived')
        .map((target) => (
          <Button
            key={target}
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void transition(target)}
          >
            {TRANSITION_LABEL[target]}
          </Button>
        ))}
      {nextStatuses.includes('archived') ? (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={busy}
          onClick={() => setConfirmArchive(true)}
        >
          Archive
        </Button>
      ) : null}

      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title="Archive this campaign?"
        description={
          <>
            Archiving is permanent — a campaign cannot be restored afterwards. Existing
            attributions are kept and the campaign stays reportable, but it will not accept new
            attributions.
          </>
        }
        confirmLabel="Archive campaign"
        destructive
        busy={busy}
        onConfirm={() => transition('archived')}
      />
    </div>
  );
}
