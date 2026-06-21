import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Response } from 'express';
import { AppLogger } from '../../../observability/logger.js';
import { BillingSseRedisBroker } from './BillingSseRedisBroker.js';

type SseEventName = 'subscription_status';
type RedisSubscriptionStatusEnvelope = {
  version: number;
  origin: string;
  event: SseEventName;
  payload: unknown;
};

const REDIS_ENVELOPE_VERSION = 1;

function writeSseEvent(res: Response, event: SseEventName, data: unknown) {
  // SSE precisa do prefixo data
  const json = JSON.stringify(data ?? null);
  res.write(`event: ${event}\n`);
  for (const line of json.split('\n')) {
    res.write(`data: ${line}\n`);
  }
  res.write('\n');
}

@Injectable()
export class BillingSseHub {
  private readonly clientsByUserId = new Map<string, Set<Response>>();
  private readonly instanceId = randomUUID();
  private redisListenerStarted = false;

  constructor(
    private readonly logger: AppLogger,
    @Optional() private readonly redisBroker?: BillingSseRedisBroker
  ) {}

  addClient(userId: string, res: Response) {
    const set = this.clientsByUserId.get(userId) ?? new Set<Response>();
    set.add(res);
    this.clientsByUserId.set(userId, set);
    this.ensureRedisListener();
  }

  removeClient(userId: string, res: Response) {
    const set = this.clientsByUserId.get(userId);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) this.clientsByUserId.delete(userId);
  }

  private publishLocalSubscriptionStatus(userId: string, subscriptionStatusSummary: unknown) {
    const set = this.clientsByUserId.get(userId);
    if (!set || set.size === 0) return;

    for (const res of Array.from(set)) {
      const streamResponse = res;
      // fecha conexoes encerradas
      if (streamResponse.writableEnded || (streamResponse as any).destroyed) {
        set.delete(res);
        continue;
      }
      try {
        writeSseEvent(res, 'subscription_status', subscriptionStatusSummary ?? null);
      } catch {
        set.delete(res);
      }
    }

    if (set.size === 0) this.clientsByUserId.delete(userId);
  }

  private parseRedisEnvelope(raw: unknown): RedisSubscriptionStatusEnvelope | null {
    if (!raw || typeof raw !== 'object') return null;

    const value = raw as Partial<RedisSubscriptionStatusEnvelope>;
    if (value.version !== REDIS_ENVELOPE_VERSION) return null;
    if (value.event !== 'subscription_status') return null;
    if (typeof value.origin !== 'string') return null;

    return value as RedisSubscriptionStatusEnvelope;
  }

  private async startRedisListener() {
    if (!this.redisBroker) {
      this.redisListenerStarted = false;
      return;
    }

    try {
      const started = await this.redisBroker.ensureSubscriptionStatusListener((userId, payload) => {
        const envelope = this.parseRedisEnvelope(payload);
        if (envelope) {
          if (envelope.origin === this.instanceId) return;
          this.publishLocalSubscriptionStatus(userId, envelope.payload ?? null);
          return;
        }

        this.publishLocalSubscriptionStatus(userId, payload ?? null);
      });

      if (started) return;
      this.redisListenerStarted = false;
    } catch (error) {
      this.redisListenerStarted = false;
      this.logger.warn(`Failed to activate SSE Redis listener: ${error}`);
    }
  }

  private ensureRedisListener() {
    if (!this.redisBroker || this.redisListenerStarted) return;
    this.redisListenerStarted = true;
    void this.startRedisListener();
  }

  private async publishRedisSubscriptionStatus(
    userId: string,
    envelope: RedisSubscriptionStatusEnvelope
  ) {
    if (!this.redisBroker) return;
    await this.redisBroker.publishSubscriptionStatus(userId, envelope);
  }

  publishSubscriptionStatus(userId: string, subscriptionStatusSummary: unknown) {
    if (!userId) return;

    this.publishLocalSubscriptionStatus(userId, subscriptionStatusSummary);

    if (!this.redisBroker) return;

    const envelope: RedisSubscriptionStatusEnvelope = {
      version: REDIS_ENVELOPE_VERSION,
      origin: this.instanceId,
      event: 'subscription_status',
      payload: subscriptionStatusSummary ?? null,
    };

    void this.publishRedisSubscriptionStatus(userId, envelope);
  }
}
