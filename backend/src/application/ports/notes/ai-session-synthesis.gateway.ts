import type { NoteSynthesisItem } from '../../models/note-synthesis.models.js';
import type { AiProvider } from '../../../contracts/enums.js';

export type SessionSynthesisResult = { overview: string; memory: NoteSynthesisItem[] };
export type AiSessionSynthesisConfig = { provider: AiProvider; baseUrl: string; model: string; apiKey: string };

export abstract class AiSessionSynthesisGateway {
  abstract generate(config: AiSessionSynthesisConfig, transcript: string): Promise<SessionSynthesisResult>;
}
