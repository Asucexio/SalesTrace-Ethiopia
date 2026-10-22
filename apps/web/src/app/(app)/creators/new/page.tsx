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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Textarea } from '@/components/ui/textarea';
import { createCreatorSchema } from '@salestrace/validation';

type CreateCreatorValues = z.infer<typeof createCreatorSchema>;

export default function NewCreatorPage() {
  const router = useRouter();
  const { organization } = useSession();
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const form = useForm<CreateCreatorValues>({
    resolver: zodResolver(createCreatorSchema),
    defaultValues: {
      internalCode: '',
      displayName: '',
      contactEmail: '',
      contactPhone: '',
      platform: '',
      niche: '',
      profileUrl: '',
      audienceLocation: 'Addis Ababa',
      audienceLanguage: 'am',
      notes: '',
    },
  });

  async function onSubmit(values: CreateCreatorValues) {
    setSubmitting(true);
    setFormError(null);
    try {
      const created = await api.creators.create({
        internalCode: values.internalCode,
        displayName: values.displayName,
        contactEmail: values.contactEmail ? values.contactEmail : null,
        contactPhone: values.contactPhone ? values.contactPhone : null,
        platform: values.platform ? values.platform : null,
        niche: values.niche ? values.niche : null,
        profileUrl: values.profileUrl ? values.profileUrl : null,
        audienceLocation: values.audienceLocation ? values.audienceLocation : null,
        audienceLanguage: values.audienceLanguage ? values.audienceLanguage : null,
        notes: values.notes ? values.notes : null,
      });
      toast.success('Creator created');
      router.push(`/creators/${created.id}`);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'We could not create the creator. Try again.';
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="New creator"
        description={`The internal code is unique inside ${organization?.name ?? 'this workspace'} and is used to build coupon codes.`}
        actions={
          <Button asChild variant="outline">
            <Link href="/creators">Cancel</Link>
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
              <CardTitle className="text-base">Profile</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display name</FormLabel>
                    <FormControl>
                      <Input placeholder="Mira Bekele" aria-invalid={Boolean(form.formState.errors.displayName)} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="internalCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Internal code</FormLabel>
                    <FormControl>
                      <Input placeholder="CR-MIRA" aria-invalid={Boolean(form.formState.errors.internalCode)} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="platform"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Platform</FormLabel>
                    <FormControl>
                      <Input placeholder="instagram" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="niche"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Niche</FormLabel>
                    <FormControl>
                      <Input placeholder="beauty" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="profileUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Profile URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://instagram.com/mira" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contactEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="mira@example.et" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contactPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact phone</FormLabel>
                    <FormControl>
                      <Input placeholder="+251911000000" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="audienceLocation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Audience location</FormLabel>
                    <FormControl>
                      <Input placeholder="Addis Ababa" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="audienceLanguage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Audience language</FormLabel>
                    <FormControl>
                      <Input placeholder="am" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Internal notes</FormLabel>
                    <FormControl>
                      <Textarea rows={3} placeholder="Rates, deliverables, anything the team should know" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button asChild variant="outline" type="button">
              <Link href="/creators">Cancel</Link>
            </Button>
            <Button type="submit" loading={submitting}>
              Create creator
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
