import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';
import { tracer, authFailuresCounter } from '../instrumentation';
import { SpanStatusCode } from '@opentelemetry/api';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    roles: string[];
  };
}

export function authMiddleware(requireAuth: boolean = true) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const span = tracer.startSpan('auth.validate_token');
    
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        if (requireAuth) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'No authorization header' });
          authFailuresCounter.add(1, { reason: 'missing_header' });
          return res.status(401).json({ error: 'Authorization header required' });
        }
        span.end();
        return next();
      }

      const [scheme, token] = authHeader.split(' ');
      
      if (scheme !== 'Bearer' || !token) {
        if (requireAuth) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Invalid auth scheme' });
          authFailuresCounter.add(1, { reason: 'invalid_scheme' });
          return res.status(401).json({ error: 'Invalid authorization format' });
        }
        span.end();
        return next();
      }

      span.setAttribute('auth.scheme', scheme);

      try {
        const decoded = jwt.verify(token, config.jwtSecret) as {
          userId: string;
          email: string;
          roles: string[];
        };
        
        req.user = decoded;
        span.setAttribute('auth.user_id', decoded.userId);
        span.setStatus({ code: SpanStatusCode.OK });
        
        logger.debug('Token validated successfully', { userId: decoded.userId });
      } catch (jwtError) {
        if (requireAuth) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Invalid token' });
          authFailuresCounter.add(1, { reason: 'invalid_token' });
          return res.status(401).json({ error: 'Invalid or expired token' });
        }
      }

      span.end();
      next();
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.recordException(error as Error);
      span.end();
      
      logger.error('Auth middleware error', { error });
      authFailuresCounter.add(1, { reason: 'internal_error' });
      
      if (requireAuth) {
        return res.status(500).json({ error: 'Authentication error' });
      }
      next();
    }
  };
}

export default authMiddleware;

