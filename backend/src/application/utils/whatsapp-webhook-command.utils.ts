import { extractWhatsappExternalId, parseWhatsappEvolutionMessage } from './webhook.utils.js';
import { extractWhatsappConnectionCode } from '../integration-connections.js';
import { conversationInputSchema, type ConversationInput } from '../../contracts/conversation.js';

type WhatsappWebhookIgnoreReason = 'unsupported_event' | 'missing_payload' | 'from_me' | 'not_group';
const BOT_MESSAGE_PREFIX = '[BOT]';

export type WhatsappWebhookCommand =
  | {
      kind: 'ignore';
      reason: WhatsappWebhookIgnoreReason;
    }
  | {
      kind: 'reject';
      reason: 'missing_external_identity';
    }
  | {
      kind: 'connect';
      externalId: string;
      code: string;
    }
  | {
      kind: 'conversation';
      externalId: string;
      input: ConversationInput;
    };

export function buildWhatsappWebhookCommand(body: Record<string, unknown>): WhatsappWebhookCommand {
  const parsedMessage = parseWhatsappEvolutionMessage(body);
  if (parsedMessage.kind === 'ignored') {
    return { kind: 'ignore', reason: parsedMessage.reason };
  }
  if (!parsedMessage.isGroup) {
    return { kind: 'ignore', reason: 'not_group' };
  }
  if (parsedMessage.fromMe && parsedMessage.messageText.startsWith(BOT_MESSAGE_PREFIX)) {
    return { kind: 'ignore', reason: 'from_me' };
  }

  const externalId = extractWhatsappExternalId(body);
  if (!externalId) {
    return { kind: 'reject', reason: 'missing_external_identity' };
  }

  const connectionCode = extractWhatsappConnectionCode(body);
  if (connectionCode) {
    return { kind: 'connect', externalId, code: connectionCode };
  }

  return {
    kind: 'conversation',
    externalId,
    input: conversationInputSchema.parse({
      messageText: parsedMessage.messageText,
      senderId: parsedMessage.senderId,
      groupId: parsedMessage.groupId,
      messageId: parsedMessage.messageId,
      hasMedia: parsedMessage.hasMedia,
      media: {},
    }),
  };
}
