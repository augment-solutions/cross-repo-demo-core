// Import instrumentation first to ensure proper setup
import { sdk, shutdownOtel } from './instrumentation';

import { createApp } from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { getRedisClient } from './middleware/rateLimit';

async function main() {
  try {
    logger.info(`Starting ${config.serviceName} v${config.serviceVersion}`);

    // Get Redis client (will auto-connect on first command due to lazyConnect)
    const redis = getRedisClient();
    // Ping to verify connection
    await redis.ping();
    logger.info('Connected to Redis');

    // Create Express app
    const app = createApp();

    // Start HTTP server
    const server = app.listen(config.port, config.host, () => {
      logger.info(`API Gateway listening on ${config.host}:${config.port}`);
      logger.info('Configured routes:', {
        routeCount: Object.keys(config.services).length,
      });
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);

      server.close(() => {
        logger.info('HTTP server closed');
      });

      // Close Redis connection
      try {
        await redis.quit();
        logger.info('Redis connection closed');
      } catch (err) {
        logger.error('Error closing Redis connection', { error: err });
      }

      // Shutdown OpenTelemetry
      try {
        await shutdownOtel();
        logger.info('OpenTelemetry SDK shut down');
      } catch (err) {
        logger.error('Error shutting down OpenTelemetry', { error: err });
      }

      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start API Gateway', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

main();

