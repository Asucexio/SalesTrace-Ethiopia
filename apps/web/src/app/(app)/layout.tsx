'use client';

import * as React from 'react';
import Link from 'next/link';

import { ProtectedRoute } from '@/components/auth/protected-route';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { TopBar } from '@/components/layout/top-bar';
import { Separator } from '@/components/ui/separator';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <div className="flex min-h-screen flex-col">
        <TopBar />
        <div className="flex flex-1 flex-col lg:flex-row">
          <aside className="hidden w-60 shrink-0 border-r border-border bg-card/40 lg:block">
            <div className="sticky top-14 py-4">
              <AppSidebar />
            </div>
          </aside>
          <main className="min-w-0 flex-1">
            <Separator className="lg:hidden" />
            <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
          </main>
        </div>
        <footer className="border-t border-border px-6 py-4 text-xs text-muted-foreground">
          <Link href="/dashboard" className="underline-offset-4 hover:underline">
            {process.env.NEXT_PUBLIC_APP_NAME ?? 'SalesTrace Ethiopia'}
          </Link>{' '}
          — attributed revenue and ROAS only. Never ROI.
        </footer>
      </div>
    </ProtectedRoute>
  );
}
