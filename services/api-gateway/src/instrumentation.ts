/**
 * OpenTelemetry instrumentation for API Gateway Service.
 * This module must be loaded before any other imports to ensure proper instrumentation.
 * All components use 100% open source tools (Apache 2.0 licensed).
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { metrics, trace } from '@opentelemetry/api';

// Service configuration
const serviceName = process.env.OTEL_SERVICE_NAME || 'api-gateway';
const serviceVersion = process.env.SERVICE_VERSION || '1.0.0';
const environment = process.env.ENVIRONMENT || 'development';
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317';

// Create resource with service information
const resource = new Resource({
  [SEMRESATTRS_SERVICE_NAME]: serviceName,
  [SEMRESATTRS_SERVICE_VERSION]: serviceVersion,
  [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: environment,
  'service.namespace': 'ecomm-stack',
});

// Create OTLP trace exporter
const traceExporter = new OTLPTraceExporter({
  url: otlpEndpoint,
});

// Create OTLP metric exporter
const metricExporter = new OTLPMetricExporter({
  url: otlpEndpoint,
});

// Create metric reader
const metricReader = new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: 60000,
});

// Initialize OpenTelemetry SDK
const sdk = new NodeSDK({
  resource,
  traceExporter,
  metricReader: metricReader as any,
  textMapPropagator: new W3CTraceContextPropagator(),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-express': { enabled: true },
      '@opentelemetry/instrumentation-http': { enabled: true },
      '@opentelemetry/instrumentation-ioredis': { enabled: true },
    }),
  ],
});

// Start the SDK
sdk.start();

console.log(`OpenTelemetry initialized for ${serviceName} v${serviceVersion}`);

// Get tracer and meter for custom instrumentation
export const tracer = trace.getTracer(serviceName, serviceVersion);
export const meter = metrics.getMeter(serviceName, serviceVersion);

// Custom metrics for API Gateway
export const requestsCounter = meter.createCounter('gateway.requests_total', {
  description: 'Total number of requests processed by the gateway',
  unit: '1',
});

export const requestsByServiceCounter = meter.createCounter('gateway.requests_by_service', {
  description: 'Requests by target service',
  unit: '1',
});

export const rateLimitHitsCounter = meter.createCounter('gateway.rate_limit_hits', {
  description: 'Number of rate limit hits',
  unit: '1',
});

export const authFailuresCounter = meter.createCounter('gateway.auth_failures', {
  description: 'Number of authentication failures',
  unit: '1',
});

export const requestLatencyHistogram = meter.createHistogram('gateway.request_latency', {
  description: 'Request latency in milliseconds',
  unit: 'ms',
});

export const upstreamLatencyHistogram = meter.createHistogram('gateway.upstream_latency', {
  description: 'Upstream service latency in milliseconds',
  unit: 'ms',
});

export const activeConnectionsGauge = meter.createUpDownCounter('gateway.active_connections', {
  description: 'Number of active connections',
  unit: '1',
});

// Shutdown function
export async function shutdownOtel(): Promise<void> {
  await sdk.shutdown();
  console.log('OpenTelemetry SDK shut down successfully');
}

export { sdk };

