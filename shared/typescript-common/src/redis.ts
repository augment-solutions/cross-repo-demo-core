import Redis from 'ioredis';
import { EventEnvelope } from './events';

export class RedisStreamsClient {
  private client: Redis;

  constructor(options?: { host?: string; port?: number; password?: string }) {
    this.client = new Redis({
      host: options?.host || 'localhost',
      port: options?.port || 6379,
      password: options?.password,
    });
  }

  async publish(stream: string, envelope: EventEnvelope): Promise<string> {
    const payload = JSON.stringify(envelope);
    const messageId = await this.client.xadd(
      stream,
      'MAXLEN',
      '~',
      '10000',
      '*',
      'payload',
      payload
    );
    return messageId || '';
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}

