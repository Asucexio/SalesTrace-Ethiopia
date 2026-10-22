'use client';

import * as React from 'react';
import { Menu, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { OrganizationSwitcher } from '@/components/layout/organization-switcher';
import { UserMenu } from '@/components/layout/user-menu';
import { Button } from '@/components/ui/button';

/** The sticky top bar: workspace switcher on the left, account menu on the right. */
export function TopBar({ className }: { className?: string }) {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur',
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="lg:hidden"
        aria-expanded={mobileNavOpen}
        aria-controls="mobile-navigation"
        onClick={() => setMobileNavOpen((open) => !open)}
      >
        {mobileNavOpen ? (
          <X className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Menu className="h-5 w-5" aria-hidden="true" />
        )}
        <span className="sr-only">{mobileNavOpen ? 'Close navigation' : 'Open navigation'}</span>
      </Button>

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <OrganizationSwitcher />
      </div>

      <div className="flex items-center gap-2">
        <UserMenu />
      </div>

      {mobileNavOpen ? (
        <div
          id="mobile-navigation"
          className="absolute inset-x-0 top-14 border-b border-border bg-background shadow-sm lg:hidden"
        >
          <AppSidebar />
        </div>
      ) : null}
    </header>
  );
}
