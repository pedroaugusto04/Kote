import { z } from 'zod';

export const createPushSubscriptionBodySchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

export type CreatePushSubscriptionBody = z.infer<typeof createPushSubscriptionBodySchema>;

export const deletePushSubscriptionBodySchema = z.object({
  endpoint: z.string().url(),
});

export type DeletePushSubscriptionBody = z.infer<typeof deletePushSubscriptionBodySchema>;
