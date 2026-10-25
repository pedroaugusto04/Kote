import { Injectable } from '@nestjs/common';

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;

const NOTICE_COOLDOWN_MS = 30 * SECOND_MS;

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitRule = {
  key: string;
  limit: number;
  windowMs: number;
};

export type WhatsappRateLimitInput = {
  userId: string;
  workspaceSlug: string;
  chatId: string;
  senderId: string;
  nowMs?: number;
};

export type WhatsappRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number; noticeAllowed: boolean };

@Injectable()
export class WhatsappWebhookRateLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>();
  private readonly notices = new Map<string, number>();

  consume(input: WhatsappRateLimitInput): WhatsappRateLimitResult {
    const nowMs = input.nowMs ?? Date.now();
    this.prune(nowMs);
    const rules = this.rules(input);
    const blocked = rules
      .map((rule) => ({ rule, bucket: this.currentBucket(rule, nowMs) }))
      .filter(({ rule, bucket }) => bucket.count >= rule.limit);

    if (blocked.length) {
      const retryAfterMs = Math.max(...blocked.map(({ bucket }) => bucket.resetAt - nowMs));
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / SECOND_MS)),
        noticeAllowed: this.consumeNotice(input, nowMs),
      };
    }

    for (const rule of rules) {
      const bucket = this.currentBucket(rule, nowMs);
      bucket.count += 1;
    }
    return { allowed: true };
  }

  private rules(input: WhatsappRateLimitInput): RateLimitRule[] {
    const workspace = `workspace:${input.userId}:${input.workspaceSlug}`;
    const chat = `${workspace}:chat:${input.chatId}`;
    const sender = `${chat}:sender:${input.senderId}`;
    return [
      { key: sender, limit: 6, windowMs: MINUTE_MS },
      { key: chat, limit: 30, windowMs: MINUTE_MS },
      { key: workspace, limit: 120, windowMs: HOUR_MS },
    ];
  }

  private currentBucket(rule: RateLimitRule, nowMs: number) {
    const existing = this.buckets.get(rule.key);
    if (existing && existing.resetAt > nowMs) return existing;
    const next = { count: 0, resetAt: nowMs + rule.windowMs };
    this.buckets.set(rule.key, next);
    return next;
  }

  private consumeNotice(input: WhatsappRateLimitInput, nowMs: number) {
    const key = `notice:${input.userId}:${input.workspaceSlug}:${input.chatId}:${input.senderId}`;
    const blockedUntil = this.notices.get(key) || 0;
    if (blockedUntil > nowMs) return false;
    this.notices.set(key, nowMs + NOTICE_COOLDOWN_MS);
    return true;
  }

  private prune(nowMs: number) {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= nowMs) this.buckets.delete(key);
    }
    for (const [key, blockedUntil] of this.notices) {
      if (blockedUntil <= nowMs) this.notices.delete(key);
    }
  }
}

@Injectable()
export class WhatsappConversationTaskQueue {
  private readonly tails = new Map<string, Promise<unknown>>();

  enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) || Promise.resolve();
    const current = previous.catch(() => undefined).then(task);
    const tail = current.catch(() => undefined);
    this.tails.set(key, tail);
    void tail.finally(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return current;
  }
}
