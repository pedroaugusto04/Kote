import type { AiProvider } from '../../../contracts/enums.js';

export type AudioTranscriptionConfig = {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
};

export type AudioTranscriptionInput = {
  dataBase64: string;
  mimeType: string;
  fileName: string;
};

export abstract class AudioTranscriptionGateway {
  abstract transcribe(
    config: AudioTranscriptionConfig,
    input: AudioTranscriptionInput,
  ): Promise<string>;
}
