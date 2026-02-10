import { createProxyMiddleware, Options } from 'http-proxy-middleware';
import { Request, Response, NextFunction } from 'express';
import { tracer, upstreamLatencyHistogram } from '../instrumentation';
import { logger } from '../utils/logger';
import { SpanStatusCode, context, propagation } from '@opentelemetry/api';

export interface ProxyOptions {
  target: string;
  serviceName: string;
  pathRewrite?: Record<string, string>;
}

export function createServiceProxy(options: ProxyOptions) {
  const { target, serviceName, pathRewrite } = options;

  const proxyOptions: Options = {
    target,
    changeOrigin: true,
    pathRewrite,

    onProxyReq: (proxyReq: any, req: any) => {
      const startTime = Date.now();
      (req as any)._proxyStartTime = startTime;

      // Inject trace context headers
      const carrier: Record<string, string> = {};
      propagation.inject(context.active(), carrier);
      Object.entries(carrier).forEach(([key, value]) => {
        proxyReq.setHeader(key, value);
      });

      // Add gateway headers
      proxyReq.setHeader('X-Gateway-Request-ID', (req as any).id || 'unknown');
      proxyReq.setHeader('X-Forwarded-Host', req.headers.host || '');
      proxyReq.setHeader('X-Forwarded-Proto', req.protocol);

      logger.debug('Proxying request', {
        service: serviceName,
        target,
        path: req.url,
        method: req.method,
      });
    },

    onProxyRes: (proxyRes: any, req: any, res: any) => {
      const startTime = (req as any)._proxyStartTime || Date.now();
      const duration = Date.now() - startTime;

      upstreamLatencyHistogram.record(duration, {
        service: serviceName,
        status_code: proxyRes.statusCode?.toString() || 'unknown',
        method: req.method || 'unknown',
      });

      // Add response headers
      res.setHeader('X-Upstream-Service', serviceName);
      res.setHeader('X-Upstream-Latency', duration.toString());

      logger.debug('Proxy response received', {
        service: serviceName,
        statusCode: proxyRes.statusCode,
        duration,
      });
    },

    onError: (err: any, req: any, res: any) => {
      logger.error('Proxy error', {
        service: serviceName,
        target,
        error: err.message,
        path: req.url,
      });

      const response = res as Response;
      if (!response.headersSent) {
        response.status(502).json({
          error: 'Bad Gateway',
          message: `Failed to connect to ${serviceName}`,
          service: serviceName,
        });
      }
    },
  };

  return createProxyMiddleware(proxyOptions);
}

export function proxyWithTracing(options: ProxyOptions) {
  const proxy = createServiceProxy(options);

  return (req: Request, res: Response, next: NextFunction) => {
    const span = tracer.startSpan(`proxy.${options.serviceName}`, {
      attributes: {
        'proxy.target': options.target,
        'proxy.service': options.serviceName,
        'http.method': req.method,
        'http.url': req.url,
      },
    });

    const originalEnd = res.end;
    res.end = function (...args: any[]) {
      span.setAttribute('http.status_code', res.statusCode);
      if (res.statusCode >= 400) {
        span.setStatus({ code: SpanStatusCode.ERROR });
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }
      span.end();
      return originalEnd.apply(this, args as any);
    };

    proxy(req, res, next);
  };
}

export default createServiceProxy;

