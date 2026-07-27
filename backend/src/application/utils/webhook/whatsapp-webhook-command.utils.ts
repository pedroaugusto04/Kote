import { extractWhatsappExternalId, parseWhatsappEvolutionMessage } from './webhook.utils.js';
import { extractWhatsappConnectionCode } from '../../integration-connections.js';
import { conversationInputSchema, type ConversationInput } from '../../../contracts/conversation.js';
import { WebhookIgnoreReason } from '../../../contracts/enums.js';

const BOT_MESSAGE_PREFIX = '[BOT]';
const GROUP_INVOCATION_PREFIX = '/kote';

export type WhatsappWebhookCommand =
  | {
      kind: 'ignore';
      reason: WebhookIgnoreReason;
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
    return { kind: 'ignore', reason: WebhookIgnoreReason.FromMe };
  }
  if (parsedMessage.isGroup && !hasGroupInvocationPrefix(parsedMessage.messageText)) {
    return { kind: 'ignore', reason: WebhookIgnoreReason.MissingGroupPrefix };
  }
  const messageText = parsedMessage.isGroup
    ? stripGroupInvocationPrefix(parsedMessage.messageText)
    : parsedMessage.messageText;

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
  const prefixPattern = groupInvocationPrefixPattern();
  return prefixPattern.test(trimmed) ? trimmed.replace(prefixPattern, '').trim() : trimmed;
}

function hasGroupInvocationPrefix(text: string): boolean {
  return groupInvocationPrefixPattern().test(String(text || '').trim());
}

function groupInvocationPrefixPattern() {
  return new RegExp(`^${GROUP_INVOCATION_PREFIX}(?:\\s+|$)`, 'i');
}
