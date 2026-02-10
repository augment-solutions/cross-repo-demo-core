import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import 'express-async-errors';

import { config, routes } from './config';
import { logger } from './utils/logger';
import { authMiddleware } from './middleware/auth';
import { defaultRateLimiter, createRateLimiter } from './middleware/rateLimit';
import { tracingMiddleware } from './middleware/tracing';
import { proxyWithTracing } from './proxy/proxyHandler';
import { activeConnectionsGauge } from './instrumentation';

export function createApp(): Express {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  }));

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Track active connections
  app.use((req: Request, res: Response, next: NextFunction) => {
    activeConnectionsGauge.add(1);
    res.on('finish', () => {
      activeConnectionsGauge.add(-1);
    });
    next();
  });

  // Request ID middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    (req as any).id = req.headers['x-request-id'] || crypto.randomUUID();
    res.setHeader('X-Request-ID', (req as any).id);
    next();
  });

  // Root endpoint - API information
  app.get('/', (req: Request, res: Response) => {
    res.json({
      service: config.serviceName,
      version: config.serviceVersion,
      status: 'running',
      documentation: '/docs',
      health: '/health',
      timestamp: new Date().toISOString(),
    });
  });

  // Health check endpoint (no auth, no rate limit)
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      service: config.serviceName,
      version: config.serviceVersion,
      timestamp: new Date().toISOString(),
    });
  });

  // Readiness check
  app.get('/ready', (req: Request, res: Response) => {
    res.json({
      status: 'ready',
      service: config.serviceName,
    });
  });

  // Apply default rate limiting to all API routes
  app.use('/api', defaultRateLimiter);

  // Configure service routes
  for (const route of routes) {
    const serviceName = route.target.split('://')[1]?.split(':')[0] || 'unknown';
    
    // Build middleware chain
    const middlewares: express.RequestHandler[] = [
      tracingMiddleware(serviceName),
    ];

    // Add custom rate limiter if specified
    if (route.rateLimit) {
      middlewares.push(createRateLimiter(route.rateLimit));
    }

    // Add auth middleware
    middlewares.push(authMiddleware(route.requireAuth));

    // Add proxy handler with optional path rewriting
    const proxyOptions: { target: string; serviceName: string; pathRewrite?: Record<string, string> } = {
      target: route.target,
      serviceName,
    };

    if (route.rewritePath) {
      proxyOptions.pathRewrite = {
        [`^${route.path}`]: route.rewritePath,
      };
    }

    middlewares.push(proxyWithTracing(proxyOptions));

    logger.info(`Registering route: ${route.path} -> ${route.target}`, {
      requireAuth: route.requireAuth,
      rateLimit: route.rateLimit,
    });

    app.use(route.path, ...middlewares);
  }

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.method} ${req.path} not found`,
      path: req.path,
    });
  });

  // Error handler
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error('Unhandled error', {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'production' 
        ? 'An unexpected error occurred' 
        : err.message,
    });
  });

  return app;
}

export default createApp;

