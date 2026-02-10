/**
 * OpenTelemetry Tracing Module for Event-Driven Microservices.
 *
 * This module provides OpenTelemetry instrumentation utilities for TypeScript/Node.js services
 * including tracer setup, context propagation, and span creation.
 * All components use 100% open source tools (Apache 2.0 licensed).
 */

import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { Resource } from '@opentelemetry/resources';
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';
import {
  trace,
  context,
  propagation,
  SpanKind,
  Span,
  Context,
  Tracer,
} from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';

let tracer: Tracer | null = null;

export interface TracerConfig {
  serviceName?: string;
  serviceVersion?: string;
  otlpEndpoint?: string;
}

/**
 * Initialize the OpenTelemetry tracer with OTLP exporter.
 */
export function initTracer(config: TracerConfig = {}): Tracer {
  if (tracer !== null) {
    return tracer;
  }

  const serviceName = config.serviceName || process.env.OTEL_SERVICE_NAME || 'unknown-service';
  const serviceVersion = config.serviceVersion || process.env.SERVICE_VERSION || '1.0.0';
  const otlpEndpoint =
    config.otlpEndpoint || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317';

  // Create resource with service information
  const resource = new Resource({
    [SEMRESATTRS_SERVICE_NAME]: serviceName,
    [SEMRESATTRS_SERVICE_VERSION]: serviceVersion,
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: process.env.ENVIRONMENT || 'development',
    'service.namespace': process.env.SERVICE_NAMESPACE || 'ecomm-stack',
  });

  // Create tracer provider
  const provider = new NodeTracerProvider({ resource });

  // Create OTLP exporter
  const exporter = new OTLPTraceExporter({
    url: otlpEndpoint,
  });

  // Add batch processor for efficient span export
  provider.addSpanProcessor(new BatchSpanProcessor(exporter));

  // Register the provider
  provider.register({
    propagator: new W3CTraceContextPropagator(),
  });

  // Set up W3C Trace Context propagation
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());

  tracer = trace.getTracer(serviceName, serviceVersion);
  return tracer;
}

/**
 * Get the current tracer instance, initializing if necessary.
 */
export function getTracer(): Tracer {
  if (tracer === null) {
    return initTracer();
  }
  return tracer;
}

/**
 * Inject W3C trace context into a carrier object for event publishing.
 */
export function injectTraceContext(carrier: Record<string, string>): Record<string, string> {
  propagation.inject(context.active(), carrier);
  return carrier;
}

/**
 * Extract W3C trace context from a carrier object for event consuming.
 */
export function extractTraceContext(carrier: Record<string, string>): Context {
  return propagation.extract(context.active(), carrier);
}

/**
 * Create a new span with optional parent context.
 */
export function createSpan(
  name: string,
  options: {
    parentContext?: Context;
    kind?: SpanKind;
    attributes?: Record<string, string | number | boolean>;
  } = {}
): Span {
  const t = getTracer();
  const ctx = options.parentContext || context.active();

  return t.startSpan(
    name,
    {
      kind: options.kind || SpanKind.INTERNAL,
      attributes: options.attributes,
    },
    ctx
  );
}

/**
 * Run a function within a span context.
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options: {
    parentContext?: Context;
    kind?: SpanKind;
    attributes?: Record<string, string | number | boolean>;
  } = {}
): Promise<T> {
  const span = createSpan(name, options);
  const ctx = trace.setSpan(options.parentContext || context.active(), span);

  try {
    return await context.with(ctx, () => fn(span));
  } catch (error) {
    span.recordException(error as Error);
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Get the current trace context as a dictionary.
 */
export function getCurrentTraceContext(): Record<string, string> {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return carrier;
}

export { SpanKind, Span, Context };

