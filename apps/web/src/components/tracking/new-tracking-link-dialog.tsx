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
import { createTrackingLinkSchema } from '@salestrace/validation';

type TrackingLinkValues = z.infer<typeof createTrackingLinkSchema>;

export function NewTrackingLinkDialog({
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

  const form = useForm<TrackingLinkValues>({
    resolver: zodResolver(createTrackingLinkSchema),
    defaultValues: { campaignId: campaignId ?? '', creatorId: '', channel: 'link', label: '' },
  });

  React.useEffect(() => {
    if (campaignId) form.setValue('campaignId', campaignId);
  }, [campaignId, form]);

  async function onSubmit(values: TrackingLinkValues) {
    setSubmitting(true);
    setFormError(null);
    try {
      const created = await api.tracking.createLink({
        campaignId: values.campaignId,
        creatorId: values.creatorId,
        channel: values.channel,
        label: values.label ? values.label : null,
      });
      toast.success('Tracking link created');
      onOpenChange(false);
      onCreated?.();
      if (created.url) {
        toast.message(created.url, { description: 'Share this link with the creator.' });
      }
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'We could not create the tracking link.';
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
              <DialogTitle>New tracking link</DialogTitle>
              <DialogDescription>
                The link code is generated for you. Share the URL or the QR code with the creator.
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
              name="channel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Channel</FormLabel>
                  <Select value={field.value ?? 'link'} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="link">Link</SelectItem>
                      <SelectItem value="qr">QR code</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Label</FormLabel>
                  <FormControl>
                    <Input placeholder="Mira IG Story" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormDescription>How you will recognise this link.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" loading={submitting}>
                Create link
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
