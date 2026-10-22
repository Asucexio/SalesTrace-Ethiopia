import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Internal (server-side) address of the API. Never exposed to the browser. */
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // The monorepo root — the shared workspace packages live outside this app.
  outputFileTracingRoot: path.join(here, '..', '..'),

  // The shared workspace packages are plain TypeScript; Next compiles them alongside the app.
  transpilePackages: ['@salestrace/shared-types', '@salestrace/validation'],

  experimental: {
    // The shared packages use NodeNext-style `./foo.js` specifiers that point at `./foo.ts`
    // sources. Teach webpack the same substitution TypeScript performs.
    extensionAlias: {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    },
    // The build machine is memory constrained: cap the worker pool so the build workers do
    // not collectively exhaust the commit limit.
    cpus: 2,
  },

  async rewrites() {
    return [
      // REST API — `/api/v1/...` on the browser hits `/api/v1/...` on the API server.
      { source: '/api/:path*', destination: `${API_INTERNAL_URL}/api/:path*` },
      // Public tracking redirect — `https://<brand-domain>/r/<code>`.
      { source: '/r/:path*', destination: `${API_INTERNAL_URL}/r/:path*` },
    ];
  },
};

export default nextConfig;
