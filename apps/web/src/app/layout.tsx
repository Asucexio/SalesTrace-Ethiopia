import type { Metadata, Viewport } from 'next';
import { Inter, Manrope } from 'next/font/google';
import { Toaster } from 'sonner';

import { TooltipProvider } from '@/components/ui/tooltip';
import { SessionProvider } from '@/lib/session';
import { ThemeProvider } from '@/components/theme-provider';
import './globals.css';

const fontSans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const fontDisplay = Manrope({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? 'SalesTrace Ethiopia';

export const metadata: Metadata = {
  title: {
    default: `${appName} — Creator attribution for real orders`,
    template: `%s · ${appName}`,
  },
  description:
    'SalesTrace connects creator links, coupons and QR codes to imported orders, so Ethiopian brands and agencies can report attributed revenue, cost per attributed order and ROAS in ETB.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${fontSans.variable} ${fontDisplay.variable} min-h-screen bg-background font-sans text-foreground antialiased`}
      >
        <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(var(--primary)/0.06),transparent)] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(var(--primary)/0.18),transparent)]" />
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          <SessionProvider>
            <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
            <Toaster richColors closeButton position="bottom-right" />
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
