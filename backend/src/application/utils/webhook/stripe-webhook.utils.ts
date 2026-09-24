import crypto from 'node:crypto';

export function verifyStripeWebhookSignature(payload: string, header: string, secret: string): boolean {
  try {
    const parts = header.split(',');
    let timestamp = '';
    const signatures: string[] = [];

    for (const part of parts) {
      const [key, val] = part.split('=');
      if (key === 't') timestamp = val;
      if (key === 'v1') signatures.push(val);
    }

    if (!timestamp || signatures.length === 0) {
      return false;
    }

    const signedPayload = `${timestamp}.${payload}`;
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(signedPayload);
    const expectedSignature = hmac.digest('hex');

    return signatures.includes(expectedSignature);
  } catch {
    return false;
  }
}

export function extractStripeEventIds(
  body: any,
  eventType: string,
): { gatewayPaymentId: string | null; gatewaySubscriptionId: string | null } {
  const dataObject = body?.data?.object;
  const isPaymentEvent = eventType.startsWith('invoice.') || eventType.startsWith('payment_intent.');
  const gatewayPaymentId = dataObject?.id && isPaymentEvent ? String(dataObject.id) : null;
  const gatewaySubscriptionId = dataObject?.subscription ? String(dataObject.subscription) : null;

  return { gatewayPaymentId, gatewaySubscriptionId };
}

export function buildStripeDedupKey(body: any, gatewayEventId: string | null): string {
  return gatewayEventId || crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
}
