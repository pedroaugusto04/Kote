import { Injectable } from '@nestjs/common';
import webpush from 'web-push';
import { PushSubscriptionRepository } from '../ports/push/push-subscription.repository.js';
import { VapidService } from './vapid.service.js';
import { AppLogger } from '../../observability/logger.js';

@Injectable()
export class PushNotificationService {
  constructor(
    private readonly pushSubscriptionRepository: PushSubscriptionRepository,
    private readonly vapidService: VapidService,
    private readonly logger: AppLogger,
  ) {}

  async sendToUser(
    userId: string,
    payload: { title: string; body: string; url?: string },
  ): Promise<void> {
    const subscriptions = await this.pushSubscriptionRepository.listByUserId(userId);
    if (subscriptions.length === 0) return;

    const pubKey = this.vapidService.getPublicKey();
    const privKey = this.vapidService.getPrivateKey();

    // Configure VAPID details
    webpush.setVapidDetails(
      'mailto:suporte@knowledge-base.local',
      pubKey,
      privKey,
    );

    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      data: {
        url: payload.url || '/',
      },
    });

    const sendPromises = subscriptions.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      try {
        await webpush.sendNotification(pushSubscription, notificationPayload);
      } catch (error: any) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          this.logger.warn('push.subscription_expired_removing', {
            userId,
            endpoint: sub.endpoint,
            statusCode: error.statusCode,
          });
          await this.pushSubscriptionRepository.deleteByEndpoint(userId, sub.endpoint);
        } else {
          this.logger.error('push.send_failed', {
            userId,
            endpoint: sub.endpoint,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    });

    await Promise.all(sendPromises);
  }
}
