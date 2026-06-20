export abstract class BillingQueuePublisher {
  abstract publishWebhookEventId(webhookEventId: string): Promise<void>;
}
