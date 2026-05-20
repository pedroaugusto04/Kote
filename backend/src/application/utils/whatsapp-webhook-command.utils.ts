import { extractWhatsappExternalId, parseWhatsappEvolutionMessage } from './webhook.utils.js';
import { extractWhatsappConnectionCode } from '../integration-connections.js';
import { conversationInputSchema, type ConversationInput } from '../../contracts/conversation.js';

type WhatsappWebhookIgnoreReason = 'unsupported_event' | 'missing_payload' | 'from_me' | 'group_missing_prefix';
const BOT_MESSAGE_PREFIX = '[BOT]';
const GROUP_INVOCATION_PREFIX = '/kb';

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
  if (parsedMessage.fromMe && parsedMessage.messageText.startsWith(BOT_MESSAGE_PREFIX)) {
    return { kind: 'ignore', reason: 'from_me' };
  }
  const messageText = parsedMessage.isGroup
    ? stripGroupInvocationPrefix(parsedMessage.messageText)
    : parsedMessage.messageText;
  if (parsedMessage.isGroup && messageText === parsedMessage.messageText) {
    return { kind: 'ignore', reason: 'group_missing_prefix' };
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
      messageText,
      senderId: parsedMessage.senderId,
      chatId: parsedMessage.chatId,
      messageId: parsedMessage.messageId,
      hasMedia: parsedMessage.hasMedia,
      media: parsedMessage.media,
    }),
  };
}

function stripGroupInvocationPrefix(text: string): string {
  const trimmed = String(text || '').trim();
  const prefixPattern = new RegExp(`^${GROUP_INVOCATION_PREFIX}(?:\\s+|$)`, 'i');
  return prefixPattern.test(trimmed) ? trimmed.replace(prefixPattern, '').trim() : trimmed;
}
