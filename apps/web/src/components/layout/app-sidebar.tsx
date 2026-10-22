'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  FileBarChart,
  LayoutDashboard,
  Link2,
  Megaphone,
  Settings2,
  ShoppingBag,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { useSession } from '@/lib/session';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Roles that may see the item. `null` means everyone. */
  roles?: Array<'owner' | 'admin' | 'marketer' | 'analyst'>;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/creators', label: 'Creators', icon: Users },
  { href: '/tracking', label: 'Tracking', icon: Link2 },
  { href: '/orders', label: 'Orders', icon: ShoppingBag },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/reports', label: 'Reports', icon: FileBarChart },
  {
    href: '/settings/team',
    label: 'Team settings',
    icon: Settings2,
    roles: ['owner', 'admin'],
  },
];

export function AppSidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const { role } = useSession();

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!item.roles) return true;
    if (!role) return false;
    return item.roles.includes(role);
  });

  return (
    <nav aria-label="Main" className={cn('flex flex-col gap-1 p-3', className)}>
      {visibleItems.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
