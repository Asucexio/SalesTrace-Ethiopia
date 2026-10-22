'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Coins, Plus } from 'lucide-react';
import type { z } from 'zod';

import { api, ApiError } from '@/lib/api';
import { minorToDecimalString } from '@salestrace/shared-types';
import { formatDate, formatMoney, toMinorUnits } from '@/lib/format';
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
import { createCampaignCostSchema } from '@salestrace/validation';

type CostValues = z.infer<typeof createCampaignCostSchema>;

export function CampaignCostsTab({
  campaignId,
  currency,
  canWrite,
}: {
  campaignId: string;
  currency: string;
  canWrite: boolean;
}) {
  const costs = useApiResource(() => api.campaigns.costs(campaignId), [campaignId]);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const totalMinor = (costs.data?.items ?? []).reduce(
    (sum, cost) => sum + (toMinorUnits(cost.amount) ?? 0),
    0,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Campaign cost drives ROAS and cost per attributed order. Currency must match the campaign.
        </p>
        {canWrite ? (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus aria-hidden="true" />
                Record cost
              </Button>
            </DialogTrigger>
            <DialogContent>
              <AddCostDialog
                campaignId={campaignId}
                currency={currency}
                onDone={() => {
                  setDialogOpen(false);
                  void costs.reload();
                }}
              />
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      {costs.error ? (
        <ErrorState error={costs.error} onRetry={() => void costs.reload()} />
      ) : costs.loading ? (
        <Skeleton className="h-48 w-full" />
      ) : costs.data && costs.data.items.length > 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <caption className="sr-only">Costs recorded against this campaign</caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Type</TableHead>
                <TableHead scope="col">Description</TableHead>
                <TableHead scope="col">Creator</TableHead>
                <TableHead scope="col">Incurred</TableHead>
                <TableHead scope="col" className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {costs.data.items.map((cost) => (
                <TableRow key={cost.id}>
                  <TableCell className="capitalize">{cost.costType.replace(/_/g, ' ')}</TableCell>
                  <TableCell className="text-muted-foreground">{cost.description ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{cost.creatorName ?? '—'}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDate(cost.incurredAt)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(cost.amount, cost.currency || currency)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={4} className="text-right font-medium">
                  Total
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatMoney(minorToDecimalString(totalMinor), currency)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState
          icon={<Coins className="h-5 w-5" />}
          title="No costs recorded"
          description="Without a recorded cost, ROAS and cost per attributed order cannot be calculated."
          action={
            canWrite ? (
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                Record cost
              </Button>
            ) : null
          }
        />
      )}
    </div>
  );
}

function AddCostDialog({
  campaignId,
  currency,
  onDone,
}: {
  campaignId: string;
  currency: string;
  onDone: () => void;
}) {
  const creators = useApiResource(() => api.creators.list({ limit: 100 }), []);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const form = useForm<CostValues>({
    resolver: zodResolver(createCampaignCostSchema),
    defaultValues: {
      creatorId: '',
      costType: 'creator_fee',
      description: '',
      amount: '',
      currency,
      incurredAt: new Date().toISOString(),
    },
  });

  async function onSubmit(values: CostValues) {
    setSubmitting(true);
    setFormError(null);
    try {
      await api.campaigns.addCost(campaignId, {
        creatorId: values.creatorId ? values.creatorId : null,
        costType: values.costType,
        description: values.description ? values.description : null,
        amount: values.amount,
        ...(values.currency ? { currency: values.currency } : {}),
        ...(values.incurredAt ? { incurredAt: new Date(values.incurredAt).toISOString() } : {}),
      });
      toast.success('Cost recorded');
      onDone();
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'We could not record that cost. Try again.';
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
          <DialogTitle>Record a cost</DialogTitle>
          <DialogDescription>
            Costs are never converted between currencies — the cost currency must match the
            campaign currency.
          </DialogDescription>
        </DialogHeader>

        {formError ? (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        ) : null}

        <FormField
          control={form.control}
          name="costType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cost type</FormLabel>
              <Select value={field.value ?? 'creator_fee'} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {[
                    'creator_fee',
                    'content_production',
                    'product_gifting',
                    'platform_fee',
                    'agency_fee',
                    'other',
                  ].map((type) => (
                    <SelectItem key={type} value={type}>
                      {type.replace(/_/g, ' ')}
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
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Amount</FormLabel>
              <FormControl>
                <Input
                  inputMode="decimal"
                  placeholder="12000.00"
                  aria-invalid={Boolean(form.formState.errors.amount)}
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
          name="creatorId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Creator (optional)</FormLabel>
              <Select value={field.value ?? ''} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Not creator specific" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {(creators.data?.items ?? []).map((creator) => (
                    <SelectItem key={creator.id} value={creator.id}>
                      {creator.displayName}
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
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Input placeholder="Production fee for the launch video" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="incurredAt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Incurred at</FormLabel>
              <FormControl>
                <Input type="datetime-local" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <DialogFooter>
          <Button type="submit" loading={submitting}>
            Record cost
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
