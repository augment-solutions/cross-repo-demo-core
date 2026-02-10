import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';
import { rateLimitHitsCounter } from '../instrumentation';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    redisClient.on('error', (err) => {
      logger.error('Redis connection error', { error: err.message });
    });

    redisClient.on('connect', () => {
      logger.info('Connected to Redis for rate limiting');
    });
  }
  return redisClient;
}

export function createRateLimiter(options?: { windowMs?: number; max?: number }) {
  const windowMs = options?.windowMs || config.defaultRateLimit.windowMs;
  const max = options?.max || config.defaultRateLimit.max;

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      sendCommand: async (command: string, ...args: string[]) =>
        getRedisClient().call(command, ...args) as any,
      prefix: 'gateway:rl:',
    }),
    handler: (req, res) => {
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      logger.warn('Rate limit exceeded', {
        ip: clientIp,
        path: req.path,
        method: req.method,
      });
      
      rateLimitHitsCounter.add(1, {
        path: req.path,
        method: req.method,
      });
      
      res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil(windowMs / 1000),
      });
    },
    keyGenerator: (req) => {
      // Use user ID if authenticated, otherwise use IP
      const authReq = req as any;
      if (authReq.user?.userId) {
        return `user:${authReq.user.userId}`;
      }
      return `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
    },
  });
}

export const defaultRateLimiter = createRateLimiter();

export default createRateLimiter;

