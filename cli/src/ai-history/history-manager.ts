import { AntigravityHistoryProvider } from './providers/antigravity.provider.js';
import { ClaudeCodeHistoryProvider } from './providers/claude-code.provider.js';
import { CodexHistoryProvider } from './providers/codex.provider.js';
import { OpenCodeHistoryProvider } from './providers/opencode.provider.js';
import type { AiHistoryProvider, AiSession } from './types.js';

function defaultProviders(): AiHistoryProvider[] {
  return [
    new ClaudeCodeHistoryProvider(),
    new CodexHistoryProvider(),
    new AntigravityHistoryProvider(),
    new OpenCodeHistoryProvider(),
  ];
}

export class AiHistoryManager {
  constructor(private readonly providers: readonly AiHistoryProvider[] = defaultProviders()) {}

  async getAllSessions(): Promise<AiSession[]> {
    const results = await Promise.allSettled(this.providers.map((provider) => provider.getRecentSessions()));
    return results
      .filter((result): result is PromiseFulfilledResult<AiSession[]> => result.status === 'fulfilled')
      .flatMap((result) => result.value)
      .sort((left, right) => right.timestamp - left.timestamp);
  }
}
