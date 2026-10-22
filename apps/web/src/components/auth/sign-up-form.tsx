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
import { registerSchema } from '@salestrace/validation';

type RegisterValues = z.infer<typeof registerSchema>;

export function SignUpForm() {
  const router = useRouter();
  const { refresh } = useSession();
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [registered, setRegistered] = React.useState(false);

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', password: '', fullName: '' },
  });

  async function onSubmit(values: RegisterValues) {
    setSubmitting(true);
    setFormError(null);
    try {
      const created = (await api.auth.register({
        email: values.email,
        password: values.password,
        ...(values.fullName ? { fullName: values.fullName } : {}),
      })) as { verificationToken?: string } | null | undefined;

      // In local development mode there is no mail provider, so the API returns the
      // verification token directly. Use it so the new account can sign in straight away.
      // (In supabase mode no token is returned and the user verifies through the email.)
      const localToken = created?.verificationToken;
      if (localToken) {
        await api.auth.verifyEmail(localToken);
        toast.success('Account created and verified. You can sign in now.');
      } else {
        toast.success('Account created. Check your email to verify the address.');
      }
      setRegistered(true);
      await refresh();
      router.push('/login');
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'We could not create your account. Try again.';
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (registered) {
    return (
      <div className="space-y-4 text-sm text-muted-foreground" role="status">
        <p>
          Your account was created. A verification email is on its way — confirm the address, then
          sign in.
        </p>
        <Button asChild className="w-full">
          <Link href="/login">Go to sign in</Link>
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
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full name</FormLabel>
              <FormControl>
                <Input autoComplete="name" placeholder="Marta Bekele" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Work email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="you@brand.et"
                  aria-invalid={Boolean(form.formState.errors.email)}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={Boolean(form.formState.errors.password)}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                At least 10 characters, including a letter and a digit.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" loading={submitting}>
          Create account
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </Form>
  );
}
