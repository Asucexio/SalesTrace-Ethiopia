/**
 * Server bootstrap.
 *
 * Starts the HTTP server, wires the graceful shutdown handlers and fails fast when the
 * configuration is invalid.
 */

import { createApp } from './app.js';
import { getEnv } from './config/env.js';
import { createContainer } from './container.js';
import { getLogger } from './shared/logger.js';

async function main(): Promise<void> {
  const env = getEnv();
  const logger = getLogger();

  const container = createContainer();
  const app = createApp(container);

  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info(
      { port: env.PORT, authMode: env.AUTH_MODE, nodeEnv: env.NODE_ENV },
      'SalesTrace API listening',
    );
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'Shutting down');

    server.close(() => {
      void container.close().finally(() => {
        process.exit(0);
      });
    });

    // Do not wait forever for lingering connections.
    setTimeout(() => {
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  const logger = getLogger();
  logger.error({ err: error }, 'Failed to start the API');
  process.exitCode = 1;
});
