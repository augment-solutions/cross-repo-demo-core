import Redis from 'ioredis';
import { SpanKind } from '@opentelemetry/api';
import { EventEnvelope } from './events';
import { extractTraceContext, withSpan } from './tracing';

// Simple console logger
const logger = {
  info: (msg: string, meta?: any) => console.log(`[INFO] ${msg}`, meta || ''),
  error: (msg: string, meta?: any) => console.error(`[ERROR] ${msg}`, meta || ''),
  warn: (msg: string, meta?: any) => console.warn(`[WARN] ${msg}`, meta || ''),
  debug: (msg: string, meta?: any) => console.debug(`[DEBUG] ${msg}`, meta || ''),
};

export type EventHandler<T = any> = (envelope: EventEnvelope<T>) => Promise<void>;

export class RedisStreamsConsumer {
  private client: Redis;
  private serviceName: string;
  private consumerGroup: string;
  private consumerName: string;
  private handlers: Map<string, EventHandler>;
  private running: boolean = false;
  private streams: Set<string> = new Set();

  constructor(redisUrl: string, serviceName: string, consumerGroup: string) {
    this.client = new Redis(redisUrl);
    this.serviceName = serviceName;
    this.consumerGroup = consumerGroup;
    this.consumerName = `${serviceName}-${process.pid}`;
    this.handlers = new Map();

    this.client.on('error', (error) => {
      logger.error('Redis connection error', { error: error.message });
    });

    this.client.on('connect', () => {
      logger.info('Connected to Redis Streams', { service: serviceName });
    });
  }

  async subscribe(eventType: string, handler: EventHandler): Promise<void> {
    this.handlers.set(eventType, handler);
    
    // Determine stream name from event type (e.g., "user.registered" -> "events:users")
    const stream = this.getStreamName(eventType);
    this.streams.add(stream);

    // Create consumer group if it doesn't exist
    try {
      await this.client.xgroup('CREATE', stream, this.consumerGroup, '0', 'MKSTREAM');
      logger.info('Created consumer group', { stream, group: this.consumerGroup });
    } catch (error: any) {
      if (!error.message.includes('BUSYGROUP')) {
        logger.error('Failed to create consumer group', { stream, error: error.message });
      }
    }

    // Start consuming if not already running
    if (!this.running) {
      this.running = true;
      this.startConsuming();
    }
  }

  private getStreamName(eventType: string): string {
    // Extract domain from event type (e.g., "user.registered" -> "user")
    // Note: We don't pluralize to match the convention used by Python and Go publishers
    const domain = eventType.split('.')[0];
    return `events:${domain}`;
  }

  private async startConsuming(): Promise<void> {
    logger.info('Starting event consumption', { 
      service: this.serviceName,
      streams: Array.from(this.streams)
    });

    while (this.running) {
      try {
        // XREADGROUP expects all stream names first, then all stream IDs
        const streams = Array.from(this.streams);
        const streamIds = streams.map(() => '>');

        const results: any = await this.client.xreadgroup(
          'GROUP',
          this.consumerGroup,
          this.consumerName,
          'COUNT',
          '10',
          'BLOCK',
          '5000',
          'STREAMS',
          ...streams,
          ...streamIds
        );

        if (results) {
          for (const [stream, messages] of results as [string, [string, string[]][]][]) {
            for (const [messageId, fields] of messages) {
              await this.processMessage(stream, messageId, fields);
            }
          }
        }
      } catch (error: any) {
        logger.error('Error consuming events', { error: error.message });
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  private async processMessage(stream: string, messageId: string, fields: string[]): Promise<void> {
    try {
      // Parse message fields (Redis returns array of [key, value, key, value, ...])
      const data: Record<string, string> = {};
      for (let i = 0; i < fields.length; i += 2) {
        data[fields[i]] = fields[i + 1];
      }

      // Parse event envelope
      const envelopeData = data.data || data.payload;
      if (!envelopeData) {
        logger.warn('Message missing data field', { messageId, stream });
        await this.client.xack(stream, this.consumerGroup, messageId);
        return;
      }

      const rawEnvelope: any = JSON.parse(envelopeData);

      // Normalize field names to camelCase (handle both snake_case from Python and camelCase from TypeScript)
      const envelope: EventEnvelope = {
        eventId: rawEnvelope.eventId || rawEnvelope.event_id,
        eventType: rawEnvelope.eventType || rawEnvelope.event_type,
        timestamp: rawEnvelope.timestamp,
        source: rawEnvelope.source,
        version: rawEnvelope.version,
        correlationId: rawEnvelope.correlationId || rawEnvelope.correlation_id,
        causationId: rawEnvelope.causationId || rawEnvelope.causation_id,
        traceContext: rawEnvelope.traceContext || rawEnvelope.trace_context,
        metadata: rawEnvelope.metadata,
        data: rawEnvelope.data,
      };

      // Extract trace context from the event for distributed tracing
      const parentContext = envelope.traceContext
        ? extractTraceContext(envelope.traceContext as Record<string, string>)
        : undefined;

      // Create a consumer span linked to the producer
      await withSpan(
        `consume ${envelope.eventType}`,
        async (span) => {
          span.setAttribute('messaging.system', 'redis_streams');
          span.setAttribute('messaging.operation', 'receive');
          span.setAttribute('event.type', envelope.eventType);
          span.setAttribute('event.id', envelope.eventId);
          span.setAttribute('event.source', envelope.source);

          // Find and execute handler
          const handler = this.handlers.get(envelope.eventType);
          if (handler) {
            await handler(envelope);
            logger.debug('Event processed', {
              eventType: envelope.eventType,
              eventId: envelope.eventId,
            });
          }
        },
        { kind: SpanKind.CONSUMER, parentContext }
      );

      // Acknowledge message
      await this.client.xack(stream, this.consumerGroup, messageId);
    } catch (error: any) {
      logger.error('Failed to process message', {
        messageId,
        stream,
        error: error.message
      });
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.client.quit();
    logger.info('Event consumer stopped', { service: this.serviceName });
  }
}

