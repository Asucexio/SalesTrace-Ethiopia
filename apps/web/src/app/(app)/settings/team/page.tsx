'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { History, ShieldCheck, UserPlus, UserX } from 'lucide-react';
import type { z } from 'zod';

import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useApiResource } from '@/lib/use-api-resource';
import { useSession } from '@/lib/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ErrorState } from '@/components/shared/error-state';
import { inviteMemberSchema } from '@salestrace/validation';
import { ORGANIZATION_ROLES } from '@salestrace/shared-types';
import type { OrganizationMember } from '@salestrace/shared-types';

type InviteValues = z.infer<typeof inviteMemberSchema>;

export default function TeamSettingsPage() {
  const { organization, role } = useSession();
  const isOwner = role === 'owner';
  const canAdminister = isOwner;

  const members = useApiResource(() => api.organizations.members(), []);
  const auditEvents = useApiResource(
    () => (canAdminister ? api.organizations.auditEvents({ limit: 25 }) : Promise.resolve(null)),
    [canAdminister],
  );

  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [removeTarget, setRemoveTarget] = React.useState<OrganizationMember | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function changeRole(member: OrganizationMember, nextRole: string) {
    setBusy(true);
    try {
      await api.organizations.updateMember(member.id, { role: nextRole });
      toast.success('Role updated');
      void members.reload();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'We could not change that role. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeMember() {
    if (!removeTarget) return;
    setBusy(true);
    try {
      await api.organizations.removeMember(removeTarget.id);
      toast.success('Member removed');
      setRemoveTarget(null);
      void members.reload();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'We could not remove that member. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team settings"
        description={`Members of ${organization?.name ?? 'this workspace'} and the audit trail of what happened in it.`}
        actions={
          isOwner ? (
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus aria-hidden="true" />
                  Invite member
                </Button>
              </DialogTrigger>
              <DialogContent>
                <InviteMemberDialog
                  onDone={() => {
                    setInviteOpen(false);
                    void members.reload();
                  }}
                />
              </DialogContent>
            </Dialog>
          ) : null
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
        </CardHeader>
        <CardContent>
          {members.error ? (
            <ErrorState error={members.error} onRetry={() => void members.reload()} />
          ) : members.loading ? (
            <Skeleton className="h-48 w-full" />
          ) : members.data && members.data.items.length > 0 ? (
            <Table>
              <caption className="sr-only">Members of this workspace</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Member</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col">Role</TableHead>
                  <TableHead scope="col">Joined</TableHead>
                  {isOwner ? <TableHead scope="col">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.data.items.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <p className="font-medium">{member.fullName ?? member.email}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={member.status === 'active' ? 'success' : 'secondary'}>
                        {member.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {isOwner ? (
                        <Select
                          value={member.role}
                          onValueChange={(value) => void changeRole(member, value)}
                          disabled={busy}
                        >
                          <SelectTrigger
                            className="w-36"
                            aria-label={`Role for ${member.email}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ORGANIZATION_ROLES.map((value) => (
                              <SelectItem key={value} value={value} className="capitalize">
                                {value}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="capitalize">{member.role}</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatDateTime(member.createdAt, organization?.timezone)}
                    </TableCell>
                    {isOwner ? (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRemoveTarget(member)}
                          aria-label={`Remove ${member.email}`}
                        >
                          <UserX aria-hidden="true" />
                          Remove
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={<ShieldCheck className="h-5 w-5" />}
              title="No members yet"
              description="Invite the people who work on your campaigns."
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit trail</CardTitle>
        </CardHeader>
        <CardContent>
          {!canAdminister ? (
            <EmptyState
              icon={<History className="h-5 w-5" />}
              title="Only owners and admins can read the audit trail"
              description="Ask an owner or admin in this workspace if you need the history."
            />
          ) : auditEvents.error ? (
            <ErrorState error={auditEvents.error} onRetry={() => void auditEvents.reload()} />
          ) : auditEvents.loading ? (
            <Skeleton className="h-48 w-full" />
          ) : auditEvents.data && auditEvents.data.items.length > 0 ? (
            <Table>
              <caption className="sr-only">Audit events recorded in this workspace</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">When</TableHead>
                  <TableHead scope="col">Action</TableHead>
                  <TableHead scope="col">Entity</TableHead>
                  <TableHead scope="col">Actor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditEvents.data.items.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatDateTime(event.createdAt, organization?.timezone)}
                    </TableCell>
                    <TableCell className="font-medium">{event.action}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {event.entityType}
                      {event.entityId ? (
                        <span className="ml-1 font-mono text-xs">{event.entityId.slice(0, 8)}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {event.actorRole ?? 'system'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={<History className="h-5 w-5" />}
              title="No audit events yet"
              description="Changes to campaigns, creators, orders and members are recorded here."
            />
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
        title="Remove this member?"
        description={
          <>
            {removeTarget?.email} will lose access to this workspace immediately. Their past work —
            campaigns, attributions and imported orders — is kept.
          </>
        }
        confirmLabel="Remove member"
        destructive
        busy={busy}
        onConfirm={removeMember}
      />
    </div>
  );
}

function InviteMemberDialog({ onDone }: { onDone: () => void }) {
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { email: '', role: 'analyst', fullName: '' },
  });

  async function onSubmit(values: InviteValues) {
    setSubmitting(true);
    setFormError(null);
    try {
      await api.organizations.inviteMember({
        email: values.email,
        role: values.role,
        ...(values.fullName ? { fullName: values.fullName } : {}),
      });
      toast.success('Invitation sent');
      onDone();
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'We could not send that invitation.';
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <DialogHeader>
          <DialogTitle>Invite a member</DialogTitle>
          <DialogDescription>
            The member receives an invitation and joins with the role you choose. Only owners and
            admins can manage members.
          </DialogDescription>
        </DialogHeader>

        {formError ? (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        ) : null}

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="teammate@brand.et"
                  aria-invalid={Boolean(form.formState.errors.email)}
                  {...field}
                  value={field.value ?? ''}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full name (optional)</FormLabel>
              <FormControl>
                <Input placeholder="Dawit Alemu" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <Select value={field.value ?? 'analyst'} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {ORGANIZATION_ROLES.map((value) => (
                    <SelectItem key={value} value={value} className="capitalize">
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                Analysts are read-only. Marketers can create campaigns and creators. Admins and
                owners can also manage members and recompute attribution.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <DialogFooter>
          <Button type="submit" loading={submitting}>
            Send invitation
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
