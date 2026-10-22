'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
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
import { createOrganizationSchema } from '@salestrace/validation';

type CreateOrganizationValues = z.infer<typeof createOrganizationSchema>;

const CURRENCIES = ['ETB', 'USD', 'EUR', 'KES', 'ZAR'];

/**
 * First-run screen: a signed-in user without an organization creates one here.
 */
export function OrganizationOnboarding() {
  const router = useRouter();
  const { refresh } = useSession();
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const form = useForm<CreateOrganizationValues>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: { name: '', slug: '', timezone: 'Africa/Addis_Ababa', currency: 'ETB' },
  });

  async function onSubmit(values: CreateOrganizationValues) {
    setSubmitting(true);
    setFormError(null);
    try {
      await api.organizations.create({
        name: values.name,
        ...(values.slug ? { slug: values.slug } : {}),
        timezone: values.timezone,
        currency: values.currency,
      });
      await refresh();
      toast.success('Workspace created');
      router.replace('/dashboard');
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'We could not create the workspace. Try again.';
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {formError ? (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        ) : null}

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Brand or agency name</FormLabel>
              <FormControl>
                <Input placeholder="Habesha Beauty" aria-invalid={Boolean(form.formState.errors.name)} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Workspace slug</FormLabel>
              <FormControl>
                <Input placeholder="habesha-beauty" {...field} />
              </FormControl>
              <FormDescription>Lowercase letters, digits and dashes. Optional.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="timezone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Timezone</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Reporting currency</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a currency" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {CURRENCIES.map((currency) => (
                      <SelectItem key={currency} value={currency}>
                        {currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>Amounts are never converted between currencies.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button type="submit" className="w-full" loading={submitting}>
          Create workspace
        </Button>
      </form>
    </Form>
  );
}
