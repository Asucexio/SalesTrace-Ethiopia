'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';

import { api, ApiError } from '@/lib/api';
import { useApiResource } from '@/lib/use-api-resource';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { createCouponCodeSchema } from '@salestrace/validation';

type CouponValues = z.infer<typeof createCouponCodeSchema>;

export function NewCouponDialog({
  open,
  onOpenChange,
  campaignId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId?: string;
  onCreated?: () => void;
}) {
  const campaigns = useApiResource(() => api.campaigns.list({ limit: 100 }), []);
  const creators = useApiResource(() => api.creators.list({ limit: 100 }), []);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const form = useForm<CouponValues>({
    resolver: zodResolver(createCouponCodeSchema),
    defaultValues: {
      campaignId: campaignId ?? '',
      creatorId: '',
      code: '',
      discountType: 'percentage',
      discountPercent: 10,
    },
  });

  React.useEffect(() => {
    if (campaignId) form.setValue('campaignId', campaignId);
  }, [campaignId, form]);

  const discountType = form.watch('discountType');

  async function onSubmit(values: CouponValues) {
    setSubmitting(true);
    setFormError(null);
    try {
      await api.tracking.createCoupon({
        campaignId: values.campaignId,
        creatorId: values.creatorId,
        ...(values.code ? { code: values.code } : {}),
        discountType: values.discountType,
        ...(values.discountPercent !== undefined && values.discountPercent !== null
          ? { discountPercent: values.discountPercent }
          : {}),
        ...(values.discountValue ? { discountValue: values.discountValue } : {}),
        ...(values.maxRedemptions ? { maxRedemptions: values.maxRedemptions } : {}),
        ...(values.validFrom ? { validFrom: values.validFrom } : {}),
        ...(values.validUntil ? { validUntil: values.validUntil } : {}),
      });
      toast.success('Coupon code created');
      onOpenChange(false);
      onCreated?.();
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'We could not create the coupon code.';
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>New coupon code</DialogTitle>
              <DialogDescription>
                A coupon bound to a creator is a creator signal — it can attribute an order on its
                own, and it wins a conflict against a click.
              </DialogDescription>
            </DialogHeader>

            {formError ? (
              <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </p>
            ) : null}

            <FormField
              control={form.control}
              name="campaignId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Campaign</FormLabel>
                  <Select value={field.value ?? ''} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a campaign" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(campaigns.data?.items ?? []).map((campaign) => (
                        <SelectItem key={campaign.id} value={campaign.id}>
                          {campaign.name}
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
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code</FormLabel>
                  <FormControl>
                    <Input placeholder="MIRA10" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormDescription>Leave empty to generate one from the creator code.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="discountType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Discount type</FormLabel>
                  <Select value={field.value ?? 'percentage'} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage</SelectItem>
                      <SelectItem value="fixed">Fixed amount</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {discountType === 'percentage' ? (
              <FormField
                control={form.control}
                name="discountPercent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Discount percentage</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        {...field}
                        value={field.value ?? ''}
                        onChange={(event) => {
                          const value = event.target.value;
                          field.onChange(value === '' ? undefined : Number(value));
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <FormField
                control={form.control}
                name="discountValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Discount amount</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="decimal"
                        placeholder="500.00"
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
            )}

            <DialogFooter>
              <Button type="submit" loading={submitting}>
                Create coupon
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
