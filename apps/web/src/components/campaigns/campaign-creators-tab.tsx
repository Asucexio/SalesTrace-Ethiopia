'use client';

import * as React from 'react';
import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { UserPlus, Users } from 'lucide-react';
import type { z } from 'zod';

import { api, ApiError } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { useApiResource } from '@/lib/use-api-resource';
import { Button } from '@/components/ui/button';
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
import { assignCreatorSchema } from '@salestrace/validation';

type AssignCreatorValues = z.infer<typeof assignCreatorSchema>;

export function CampaignCreatorsTab({
  campaignId,
  canWrite,
}: {
  campaignId: string;
  canWrite: boolean;
}) {
  const assignments = useApiResource(() => api.campaigns.creators(campaignId), [campaignId]);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Creators assigned to this campaign. Only assigned creators can receive attribution.
        </p>
        {canWrite ? (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <UserPlus aria-hidden="true" />
                Assign creator
              </Button>
            </DialogTrigger>
            <DialogContent>
              <AssignCreatorDialog
                campaignId={campaignId}
                onDone={() => {
                  setDialogOpen(false);
                  void assignments.reload();
                }}
              />
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      {assignments.error ? (
        <ErrorState error={assignments.error} onRetry={() => void assignments.reload()} />
      ) : assignments.loading ? (
        <Skeleton className="h-56 w-full" />
      ) : assignments.data && assignments.data.items.length > 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <caption className="sr-only">Creators assigned to this campaign</caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Creator</TableHead>
                <TableHead scope="col">Code</TableHead>
                <TableHead scope="col" className="text-right">Agreed fee</TableHead>
                <TableHead scope="col">Assigned</TableHead>
                <TableHead scope="col">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.data.items.map((assignment) => (
                <TableRow key={assignment.id}>
                  <TableCell>
                    <Link
                      href={`/creators/${assignment.creatorId}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {assignment.creatorName}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{assignment.creatorInternalCode}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(assignment.agreedFee, assignment.currency)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDate(assignment.assignedAt)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{assignment.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="No creators assigned yet"
          description="Assign a creator so their clicks, coupon codes and orders can be attributed to this campaign."
          action={
            canWrite ? (
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                Assign creator
              </Button>
            ) : null
          }
        />
      )}
    </div>
  );
}

function AssignCreatorDialog({
  campaignId,
  onDone,
}: {
  campaignId: string;
  onDone: () => void;
}) {
  const creators = useApiResource(() => api.creators.list({ limit: 100 }), []);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const form = useForm<AssignCreatorValues>({
    resolver: zodResolver(assignCreatorSchema),
    defaultValues: { creatorId: '', agreedFee: '', assignedAt: new Date().toISOString() },
  });

  async function onSubmit(values: AssignCreatorValues) {
    setSubmitting(true);
    setFormError(null);
    try {
      await api.campaigns.assignCreator(campaignId, {
        creatorId: values.creatorId,
        agreedFee: values.agreedFee ? values.agreedFee : null,
        ...(values.assignedAt ? { assignedAt: new Date(values.assignedAt).toISOString() } : {}),
        ...(values.notes ? { notes: values.notes } : {}),
      });
      toast.success('Creator assigned');
      onDone();
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'We could not assign that creator. Try again.';
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
          <DialogTitle>Assign a creator</DialogTitle>
          <DialogDescription>
            The agreed fee is kept separate from actual creator costs — they are reported side by
            side and never summed.
          </DialogDescription>
        </DialogHeader>

        {formError ? (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        ) : null}

        <FormField
          control={form.control}
          name="creatorId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Creator</FormLabel>
              <Select value={field.value ?? ''} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a creator" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {(creators.data?.items ?? []).map((creator) => (
                    <SelectItem key={creator.id} value={creator.id}>
                      {creator.displayName} ({creator.internalCode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="agreedFee"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Agreed fee</FormLabel>
              <FormControl>
                <Input
                  inputMode="decimal"
                  placeholder="12000.00"
                  {...field}
                  value={field.value ?? ''}
                  onChange={(event) => {
                    const value = event.target.value;
                    field.onChange(value === '' ? undefined : value);
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="assignedAt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Assigned at</FormLabel>
              <FormControl>
                <Input type="datetime-local" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormDescription>
                Clicks before this moment cannot be attributed to this creator.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <DialogFooter>
          <Button type="submit" loading={submitting}>
            Assign creator
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
