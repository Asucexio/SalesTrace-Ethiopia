'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/textarea';
import { createCampaignSchema } from '@salestrace/validation';

type CreateCampaignValues = z.infer<typeof createCampaignSchema>;

export default function NewCampaignPage() {
  const router = useRouter();
  const { organization } = useSession();
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const form = useForm<CreateCampaignValues>({
    resolver: zodResolver(createCampaignSchema),
    defaultValues: {
      name: '',
      objective: '',
      description: '',
      startAt: new Date().toISOString().slice(0, 10),
      endAt: '',
      budget: '',
      currency: organization?.currency ?? 'ETB',
      attributionWindowDays: 7,
      destinationUrl: '',
    },
  });

  async function onSubmit(values: CreateCampaignValues) {
    setSubmitting(true);
    setFormError(null);
    try {
      const created = await api.campaigns.create({
        name: values.name,
        objective: values.objective ? values.objective : null,
        description: values.description ? values.description : null,
        startAt: new Date(values.startAt).toISOString(),
        endAt: values.endAt ? new Date(values.endAt).toISOString() : null,
        budget: values.budget ? values.budget : null,
        currency: values.currency,
        attributionWindowDays: values.attributionWindowDays,
        destinationUrl: values.destinationUrl,
      });
      toast.success('Campaign created');
      router.push(`/campaigns/${created.id}`);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'We could not create the campaign. Try again.';
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="New campaign"
        description="A campaign groups creators, tracking assets, costs and the orders attributed to them."
        actions={
          <Button asChild variant="outline">
            <Link href="/campaigns">Cancel</Link>
          </Button>
        }
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
          {formError ? (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {formError}
            </p>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Basics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Campaign name</FormLabel>
                    <FormControl>
                      <Input placeholder="Summer 2026 TikTok Launch" aria-invalid={Boolean(form.formState.errors.name)} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="objective"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Objective</FormLabel>
                    <FormControl>
                      <Input placeholder="Drive first-time purchases" {...field} value={field.value ?? ''} />
                    </FormControl>
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
                      <Textarea rows={3} placeholder="What this campaign is about" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Schedule and budget</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="startAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start date</FormLabel>
                    <FormControl>
                      <Input type="date" aria-invalid={Boolean(form.formState.errors.startAt)} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        aria-invalid={Boolean(form.formState.errors.endAt)}
                        {...field}
                        value={field.value ?? ''}
                        onChange={(event) => {
                          const value = event.target.value;
                          field.onChange(value === '' ? undefined : value);
                        }}
                      />
                    </FormControl>
                    <FormDescription>Leave empty for an open-ended campaign.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="budget"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Budget</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="decimal"
                        placeholder="250000.00"
                        aria-invalid={Boolean(form.formState.errors.budget)}
                        {...field}
                        value={field.value ?? ''}
                        onChange={(event) => {
                          const value = event.target.value;
                          field.onChange(value === '' ? undefined : value);
                        }}
                      />
                    </FormControl>
                    <FormDescription>Decimal amount, up to two decimal places.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={organization?.currency ?? 'ETB'}
                        aria-invalid={Boolean(form.formState.errors.currency)}
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormDescription>Must match the workspace currency.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="attributionWindowDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Attribution window (days)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={90}
                        aria-invalid={Boolean(form.formState.errors.attributionWindowDays)}
                        {...field}
                        value={field.value ?? ''}
                        onChange={(event) => {
                          const value = event.target.value;
                          field.onChange(value === '' ? undefined : Number(value));
                        }}
                      />
                    </FormControl>
                    <FormDescription>How long after a click a purchase still counts. Default 7 days.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Destination</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="destinationUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Destination URL</FormLabel>
                    <FormControl>
                      <Input
                        type="url"
                        placeholder="https://shop.brand.et/collections/summer"
                        aria-invalid={Boolean(form.formState.errors.destinationUrl)}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>Tracking links redirect here. Must use https.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button asChild variant="outline" type="button">
              <Link href="/campaigns">Cancel</Link>
            </Button>
            <Button type="submit" loading={submitting}>
              Create campaign
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
