import { v4 as uuidv4 } from 'uuid';

/**
 * W3C Trace Context format for distributed tracing.
 * Uses standard headers: traceparent and tracestate.
 */
export interface TraceContext {
  traceparent?: string;
  tracestate?: string;
  // Legacy fields for backward compatibility
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
}

export interface EventEnvelope<T = any> {
  eventId: string;
  eventType: string;
  timestamp: string;
  source: string;
  version: string;
  correlationId?: string;
  causationId?: string;
  traceContext?: TraceContext;
  metadata?: Record<string, any>;
  data: T;
}

export function createEventEnvelope<T>(
  eventType: string,
  source: string,
  data: T,
  options?: {
    correlationId?: string;
    causationId?: string;
    traceContext?: TraceContext;
    metadata?: Record<string, any>;
  }
): EventEnvelope<T> {
  return {
    eventId: uuidv4(),
    eventType,
    timestamp: new Date().toISOString(),
    source,
    version: '1.0.0',
    correlationId: options?.correlationId,
    causationId: options?.causationId,
    traceContext: options?.traceContext,
    metadata: options?.metadata,
    data,
  };
}

