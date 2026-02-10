/**
 * Unit tests for the tracing module.
 */

import { SpanKind } from '@opentelemetry/api';

// We need to mock the OTel modules before importing tracing
jest.mock('@opentelemetry/sdk-trace-node', () => ({
  NodeTracerProvider: jest.fn().mockImplementation(() => ({
    addSpanProcessor: jest.fn(),
    register: jest.fn(),
  })),
}));

jest.mock('@opentelemetry/sdk-trace-base', () => ({
  BatchSpanProcessor: jest.fn(),
}));

jest.mock('@opentelemetry/exporter-trace-otlp-grpc', () => ({
  OTLPTraceExporter: jest.fn(),
}));

// Reset module state between tests
beforeEach(() => {
  jest.resetModules();
});

describe('TracerConfig', () => {
  it('should use default values when no config provided', async () => {
    delete process.env.OTEL_SERVICE_NAME;
    delete process.env.SERVICE_VERSION;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

    const { initTracer } = await import('./tracing');
    const tracer = initTracer();
    
    expect(tracer).toBeDefined();
  });

  it('should use environment variables when set', async () => {
    process.env.OTEL_SERVICE_NAME = 'test-service';
    process.env.SERVICE_VERSION = '2.0.0';
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://collector:4317';

    const { initTracer } = await import('./tracing');
    const tracer = initTracer();
    
    expect(tracer).toBeDefined();

    delete process.env.OTEL_SERVICE_NAME;
    delete process.env.SERVICE_VERSION;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  });

  it('should use custom config when provided', async () => {
    const { initTracer } = await import('./tracing');
    const tracer = initTracer({
      serviceName: 'custom-service',
      serviceVersion: '3.0.0',
      otlpEndpoint: 'http://custom:4317',
    });
    
    expect(tracer).toBeDefined();
  });
});

describe('getTracer', () => {
  it('should return a tracer instance', async () => {
    const { getTracer } = await import('./tracing');
    const tracer = getTracer();
    
    expect(tracer).toBeDefined();
  });

  it('should return the same tracer on subsequent calls', async () => {
    const { initTracer, getTracer } = await import('./tracing');
    initTracer();
    
    const tracer1 = getTracer();
    const tracer2 = getTracer();
    
    expect(tracer1).toBe(tracer2);
  });
});

describe('injectTraceContext', () => {
  it('should return the carrier object', async () => {
    const { injectTraceContext } = await import('./tracing');
    const carrier: Record<string, string> = {};
    
    const result = injectTraceContext(carrier);
    
    expect(result).toBe(carrier);
  });

  it('should preserve existing carrier data', async () => {
    const { injectTraceContext } = await import('./tracing');
    const carrier: Record<string, string> = { 'existing-key': 'existing-value' };
    
    const result = injectTraceContext(carrier);
    
    expect(result['existing-key']).toBe('existing-value');
  });
});

describe('extractTraceContext', () => {
  it('should return a Context object', async () => {
    const { extractTraceContext } = await import('./tracing');
    const carrier: Record<string, string> = {};
    
    const ctx = extractTraceContext(carrier);
    
    expect(ctx).toBeDefined();
  });

  it('should handle valid traceparent header', async () => {
    const { extractTraceContext } = await import('./tracing');
    const carrier: Record<string, string> = {
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    };
    
    const ctx = extractTraceContext(carrier);
    
    expect(ctx).toBeDefined();
  });
});

describe('createSpan', () => {
  it('should create a span with default options', async () => {
    const { initTracer, createSpan } = await import('./tracing');
    initTracer();
    
    const span = createSpan('test-operation');
    
    expect(span).toBeDefined();
    span.end();
  });

  it('should create a span with custom kind', async () => {
    const { initTracer, createSpan } = await import('./tracing');
    initTracer();
    
    const span = createSpan('test-operation', { kind: SpanKind.CLIENT });
    
    expect(span).toBeDefined();
    span.end();
  });

  it('should create a span with attributes', async () => {
    const { initTracer, createSpan } = await import('./tracing');
    initTracer();
    
    const span = createSpan('test-operation', {
      attributes: { 'http.method': 'GET', 'http.status_code': 200 },
    });
    
    expect(span).toBeDefined();
    span.end();
  });
});

describe('getCurrentTraceContext', () => {
  it('should return a record object', async () => {
    const { getCurrentTraceContext } = await import('./tracing');
    
    const result = getCurrentTraceContext();
    
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });
});

