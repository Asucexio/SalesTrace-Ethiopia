'use client';

import * as React from 'react';
import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { useSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Switch the active organization for the session. */
export function OrganizationSwitcher() {
  const { organization, memberships, switchOrganization, loading } = useSession();
  const [switching, setSwitching] = React.useState(false);

  async function handleSelect(organizationId: string) {
    if (organizationId === organization?.id) return;
    setSwitching(true);
    try {
      await switchOrganization(organizationId);
      toast.success('Workspace switched');
    } catch {
      toast.error('We could not switch the workspace.');
    } finally {
      setSwitching(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="max-w-[220px] justify-start gap-2"
          disabled={loading || switching}
          aria-label={`Current workspace: ${organization?.name ?? 'none'}`}
        >
          <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{organization?.name ?? 'No workspace'}</span>
          <ChevronsUpDown className="ml-auto h-3.5 w-3.5 opacity-60" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {memberships.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">No workspaces available.</p>
        ) : (
          memberships.map((membership) => {
            const isCurrent = membership.organizationId === organization?.id;
            return (
              <DropdownMenuItem
                key={membership.organizationId}
                onSelect={() => void handleSelect(membership.organizationId)}
                className={cn('justify-between', isCurrent && 'font-medium')}
              >
                <span className="truncate">{membership.organizationName}</span>
                <span className="ml-2 text-xs text-muted-foreground">{membership.role}</span>
                {isCurrent ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
