import Redis from 'ioredis';
import { SpanKind } from '@opentelemetry/api';
import { EventEnvelope, createEventEnvelope } from './events';
import { getCurrentTraceContext, withSpan } from './tracing';

// Simple console logger
const logger = {
  info: (msg: string, meta?: any) => console.log(`[INFO] ${msg}`, meta || ''),
  error: (msg: string, meta?: any) => console.error(`[ERROR] ${msg}`, meta || ''),
};

export class EventPublisher {
  private client: Redis;
  private serviceName: string;
  private streamPrefix: string;

  constructor(redisUrl: string, serviceName: string, streamPrefix: string = 'events') {
    this.client = new Redis(redisUrl);
    this.serviceName = serviceName;
    this.streamPrefix = streamPrefix;

    this.client.on('error', (error) => {
      logger.error('Redis connection error', { error: error.message });
    });

    this.client.on('connect', () => {
      logger.info('Connected to Redis for event publishing', { service: serviceName });
    });
  }

  async publish<T = any>(
    eventType: string,
    data: T,
    options?: {
      correlationId?: string;
      causationId?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<string> {
    // Get W3C trace context from OpenTelemetry for distributed tracing
    const traceContext = getCurrentTraceContext();

    const envelope = createEventEnvelope(eventType, this.serviceName, data, {
      ...options,
      traceContext,
    });

    // Determine stream name from event type (e.g., "user.registered" -> "events:users")
    const stream = this.getStreamName(eventType);

    // Create a producer span for the publish operation
    return withSpan(
      `publish ${eventType}`,
      async (span) => {
        span.setAttribute('messaging.system', 'redis_streams');
        span.setAttribute('messaging.destination', stream);
        span.setAttribute('messaging.operation', 'publish');
        span.setAttribute('event.type', eventType);
        span.setAttribute('event.id', envelope.eventId);

        // Publish to Redis Stream
        const messageId = await this.client.xadd(
          stream,
          'MAXLEN',
          '~',
          '10000',
          '*',
          'data',
          JSON.stringify(envelope)
        );

        logger.info('Event published', {
          eventType,
          eventId: envelope.eventId,
          stream,
          messageId
        });

        return messageId || '';
      },
      { kind: SpanKind.PRODUCER }
    );
  }

  private getStreamName(eventType: string): string {
    // Extract domain from event type (e.g., "user.registered" -> "users")
    const domain = eventType.split('.')[0];
    return `${this.streamPrefix}:${domain}s`;
  }

  async close(): Promise<void> {
    await this.client.quit();
    logger.info('Event publisher closed', { service: this.serviceName });
  }
}

