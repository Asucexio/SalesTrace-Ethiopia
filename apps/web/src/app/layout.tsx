import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';

import { TooltipProvider } from '@/components/ui/tooltip';
import { SessionProvider } from '@/lib/session';
import './globals.css';

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? 'SalesTrace Ethiopia';

export const metadata: Metadata = {
  title: {
    default: appName,
    template: `%s · ${appName}`,
  },
  description:
    'Influencer campaign attribution and campaign analytics for brands and agencies in Ethiopia.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground">
        <SessionProvider>
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
          <Toaster richColors closeButton position="bottom-right" />
        </SessionProvider>
      </body>
    </html>
  );
}
