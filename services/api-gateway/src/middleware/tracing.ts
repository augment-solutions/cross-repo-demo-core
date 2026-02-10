import { Request, Response, NextFunction } from 'express';
import { tracer, requestsCounter, requestLatencyHistogram, requestsByServiceCounter } from '../instrumentation';
import { SpanStatusCode, context, propagation } from '@opentelemetry/api';

export function tracingMiddleware(serviceName?: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const path = req.path;
    const method = req.method;

    // Extract trace context from incoming request headers
    const parentContext = propagation.extract(context.active(), req.headers);

    // Start span with parent context
    const span = tracer.startSpan(
      `${method} ${path}`,
      {
        attributes: {
          'http.method': method,
          'http.url': req.url,
          'http.target': path,
          'http.host': req.headers.host || 'unknown',
          'http.user_agent': req.headers['user-agent'] || 'unknown',
          'gateway.target_service': serviceName || 'unknown',
        },
      },
      parentContext
    );

    // Inject trace context for downstream services
    const carrier: Record<string, string> = {};
    propagation.inject(context.active(), carrier);
    Object.entries(carrier).forEach(([key, value]) => {
      req.headers[key] = value;
    });

    // Increment request counter
    requestsCounter.add(1, {
      method,
      path,
    });

    if (serviceName) {
      requestsByServiceCounter.add(1, {
        service: serviceName,
        method,
      });
    }

    // Capture response
    const originalSend = res.send;
    res.send = function (body) {
      const duration = Date.now() - startTime;
      
      // Record latency
      requestLatencyHistogram.record(duration, {
        method,
        path,
        status_code: res.statusCode.toString(),
      });

      // Set span attributes based on response
      span.setAttribute('http.status_code', res.statusCode);
      span.setAttribute('http.response_content_length', Buffer.byteLength(body || ''));

      if (res.statusCode >= 400) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: `HTTP ${res.statusCode}`,
        });
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }

      span.end();
      return originalSend.call(this, body);
    };

    next();
  };
}

export default tracingMiddleware;

