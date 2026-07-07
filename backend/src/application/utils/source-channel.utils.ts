import { SourceChannel } from '../../contracts/enums.js';

/**
 * Centralized identifiers used by CLI and IDE clients to identify themselves
 * when sending conversation turns to the backend.
 */
export const SOURCE_IDENTIFIERS = {
  CLI_SENDER: 'cli-user',
  CLI_CHAT: 'cli-session',
  VSCODE_SENDER: 'vscode-user',
  VSCODE_CHAT: 'vscode-chat',
} as const;

export type SourceChannelContext = {
  senderId?: string;
  chatId?: string;
  isCli?: boolean;
  isWhatsapp?: boolean;
  isExternal?: boolean;
};

/**
 * Centralized utility to determine the appropriate SourceChannel based on context.
 * Defaults to SourceChannel.External when no specific channel is identified.
 */
export function resolveSourceChannel(context: SourceChannelContext): SourceChannel {
  if (context.isCli) {
    return SourceChannel.Cli;
  }
  if (context.isWhatsapp) {
    return SourceChannel.Whatsapp;
  }
  if (context.isExternal) {
    return SourceChannel.External;
  }
  
  // Infer from sender/chat ID patterns
  const senderId = String(context.senderId || '').trim();
  const chatId = String(context.chatId || '').trim();
  
  if (senderId === SOURCE_IDENTIFIERS.CLI_SENDER && chatId === SOURCE_IDENTIFIERS.CLI_CHAT) {
    return SourceChannel.Cli;
  }
  
  // VS Code extension uses vscode-user/vscode-chat
  if (senderId === SOURCE_IDENTIFIERS.VSCODE_SENDER && chatId === SOURCE_IDENTIFIERS.VSCODE_CHAT) {
    return SourceChannel.Ide;
  }
  
  // WhatsApp typically uses phone numbers or JIDs (e.g., 5511999999999@s.whatsapp.net)
  if (senderId.includes('@') || chatId.includes('@') || /^\d+$/.test(senderId)) {
    return SourceChannel.Whatsapp;
  }
  
  // Default to External for unknown sources
  return SourceChannel.External;
}

/**
 * Get the appropriate source system string based on SourceChannel.
 */
export function getSourceSystem(channel: SourceChannel): string {
  switch (channel) {
    case SourceChannel.Cli:
      return 'kote-cli';
    case SourceChannel.Whatsapp:
      return 'evolution-api';
    case SourceChannel.Github:
      return 'github';
    case SourceChannel.AiChat:
      return 'ai-chat';
    case SourceChannel.Ide:
      return 'ide';
    case SourceChannel.External:
    default:
      return 'external';
  }
}

/**
 * Get the appropriate correlation prefix based on SourceChannel.
 */
export function getCorrelationPrefix(channel: SourceChannel): string {
  switch (channel) {
    case SourceChannel.Cli:
      return 'cli-agent';
    case SourceChannel.Whatsapp:
      return 'wpp-agent';
    case SourceChannel.Github:
      return 'github-agent';
    case SourceChannel.AiChat:
      return 'ai-chat-agent';
    case SourceChannel.Ide:
      return 'ide-agent';
    case SourceChannel.External:
    default:
      return 'external-agent';
  }
}

/**
 * Convert a string sourceChannel value to the SourceChannel enum.
 * Defaults to SourceChannel.External for unknown or empty values.
 */
export function parseSourceChannelString(channelString?: string): SourceChannel {
  if (!channelString) return SourceChannel.External;
  
  const normalized = channelString.toLowerCase().trim();
  switch (normalized) {
    case 'whatsapp':
      return SourceChannel.Whatsapp;
    case 'github':
      return SourceChannel.Github;
    case 'ai-chat':
      return SourceChannel.AiChat;
    case 'ide':
      return SourceChannel.Ide;
    case 'cli':
      return SourceChannel.Cli;
    case 'external':
    default:
      return SourceChannel.External;
  }
}
