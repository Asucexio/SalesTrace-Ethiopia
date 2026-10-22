'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

const resetPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(10, 'Password must be at least 10 characters long.')
    .max(200)
    .regex(/[A-Za-z]/, 'Password must contain a letter.')
    .regex(/[0-9]/, 'Password must contain a digit.'),
  confirmPassword: z.string().min(1, 'Please confirm the new password.'),
});

type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  async function onSubmit(values: ResetPasswordValues) {
    if (!token) {
      setFormError('This reset link is missing its token. Request a new link.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await api.auth.resetPassword(token, values.newPassword);
      setDone(true);
      toast.success('Password updated. Sign in with your new password.');
      router.push('/login');
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'We could not reset your password. Try again.';
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4 text-sm text-muted-foreground" role="status">
        <p>Your password has been changed and all other sessions were signed out.</p>
        <Button asChild className="w-full">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    );
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
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={Boolean(form.formState.errors.newPassword)}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm new password</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={Boolean(form.formState.errors.confirmPassword)}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" loading={submitting}>
          Set new password
        </Button>
      </form>
    </Form>
  );
}
