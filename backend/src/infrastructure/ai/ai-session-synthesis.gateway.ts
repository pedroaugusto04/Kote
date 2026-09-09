import { Injectable } from '@nestjs/common';
import { AiSessionSynthesisGateway, type AiSessionSynthesisConfig, type SessionSynthesisResult } from '../../application/ports/notes/ai-session-synthesis.gateway.js';
import { AiProvider } from '../../contracts/enums.js';
import { runStructuredChatCompletion } from './openai-compatible-chat.js';
import { buildAiSessionSynthesisSystemPrompt, buildAiSessionSynthesisPrompt, parseAiSessionSynthesis } from './prompts/ai-session-synthesis.prompt.js';

@Injectable()
export class DefaultAiSessionSynthesisGateway extends AiSessionSynthesisGateway {
  async generate(config: AiSessionSynthesisConfig, transcript: string, language: string): Promise<SessionSynthesisResult> {
    if (config.provider === AiProvider.None || !config.apiKey || !config.model) throw new Error('ai_session_synthesis_not_configured');
    const result = await runStructuredChatCompletion(config, buildAiSessionSynthesisSystemPrompt(), buildAiSessionSynthesisPrompt(transcript, language), parseAiSessionSynthesis);
    if (!result) throw new Error('ai_session_synthesis_empty');
    return result;
  }
}
