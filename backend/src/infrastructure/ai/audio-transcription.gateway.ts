import { Injectable } from '@nestjs/common';
import { AiProvider } from '../../contracts/enums.js';
import {
  AudioTranscriptionConfig,
  AudioTranscriptionGateway,
  AudioTranscriptionInput,
} from '../../application/ports/audio/audio-transcription.gateway.js';
import { AppLogger } from '../../observability/logger.js';
import { truncateForLog } from '../utils/logging.js';

export class AudioTranscriptionError extends Error {
  readonly provider: AiProvider;
  readonly model: string;
  readonly endpoint: string;
  readonly status?: number;
  readonly statusText?: string;
  readonly responseBody?: string;

  constructor(
    message: string,
    details: {
      provider: AiProvider;
      model: string;
      endpoint: string;
      status?: number;
      statusText?: string;
      responseBody?: string;
      cause?: unknown;
    },
  ) {
    super(message, { cause: details.cause });
    this.name = 'AudioTranscriptionError';
    this.provider = details.provider;
    this.model = details.model;
    this.endpoint = details.endpoint;
    this.status = details.status;
    this.statusText = details.statusText;
    this.responseBody = details.responseBody;
  }
}

function getSanitizedMimeType(mimeType: string): string {
  return mimeType.split(';')[0].trim().toLowerCase();
}

function getSanitizedFileName(fileName: string, mimeType: string): string {
  const cleanMime = getSanitizedMimeType(mimeType);
  const knownExtensions: Record<string, string> = {
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
    'audio/flac': 'flac',
    'audio/x-wav': 'wav',
    'audio/mp4': 'mp4',
    'audio/m4a': 'm4a',
  };

  const ext = knownExtensions[cleanMime] || 'ogg';
  const dotIndex = fileName.lastIndexOf('.');
  const baseName = dotIndex !== -1 ? fileName.slice(0, dotIndex) : fileName;
  return `${baseName || 'audio'}.${ext}`;
}

@Injectable()
export class DefaultAudioTranscriptionGateway extends AudioTranscriptionGateway {
  constructor(private readonly logger: AppLogger) {
    super();
  }

  async transcribe(
    config: AudioTranscriptionConfig,
    input: AudioTranscriptionInput,
  ): Promise<string> {
    if (config.provider === AiProvider.None || !config.apiKey || !config.model) {
      this.logger.warn('[Audio] Transcription skipped — missing config', {
        provider: config.provider,
        apiKeySet: !!config.apiKey,
        model: config.model,
      });
      return '';
    }

    if (config.provider === AiProvider.Gemini) {
      return this.transcribeGemini(config, input);
    }

    if (config.provider === AiProvider.OpenAi) {
      return this.transcribeOpenAi(config, input);
    }

    this.logger.warn('[Audio] Unsupported provider', { provider: config.provider });
    return '';
  }

  private async transcribeGemini(
    config: AudioTranscriptionConfig,
    input: AudioTranscriptionInput,
  ): Promise<string> {
    const endpoint = `${config.baseUrl.replace(/\/$/, '')}/models/${config.model}:generateContent?key=${config.apiKey}`;
    const cleanMime = getSanitizedMimeType(input.mimeType);

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: 'Transcribe the following audio recording verbatim. Do not add any summary, comments, introduction, explanation, or formatting. Only output the exact transcribed text of the audio.',
            },
            {
              inlineData: {
                mimeType: cleanMime,
                data: input.dataBase64,
              },
            },
          ],
        },
      ],
    };

    this.logger.info('[Audio] Transcribing with Gemini', {
      model: config.model,
      mimeType: cleanMime,
      fileName: input.fileName,
      sizeBytes: Buffer.from(input.dataBase64, 'base64').length,
    });

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      throw new AudioTranscriptionError('audio_transcription_request_failed', {
        provider: config.provider,
        model: config.model,
        endpoint: endpoint.replace(/key=[^&]+/, 'key=***'),
        cause: error,
      });
    }

    const responseText = await response.text();

    if (!response.ok) {
      throw new AudioTranscriptionError('audio_transcription_request_rejected', {
        provider: config.provider,
        model: config.model,
        endpoint: endpoint.replace(/key=[^&]+/, 'key=***'),
        status: response.status,
        statusText: response.statusText,
        responseBody: truncateForLog(responseText, 1000),
      });
    }

    try {
      const data = JSON.parse(responseText);
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return text.trim();
    } catch (error) {
      throw new AudioTranscriptionError('audio_transcription_invalid_json', {
        provider: config.provider,
        model: config.model,
        endpoint: endpoint.replace(/key=[^&]+/, 'key=***'),
        status: response.status,
        statusText: response.statusText,
        responseBody: truncateForLog(responseText, 1000),
        cause: error,
      });
    }
  }

  private async transcribeOpenAi(
    config: AudioTranscriptionConfig,
    input: AudioTranscriptionInput,
  ): Promise<string> {
    const endpoint = `${config.baseUrl.replace(/\/$/, '')}/audio/transcriptions`;
    const cleanMime = getSanitizedMimeType(input.mimeType);
    const cleanFileName = getSanitizedFileName(input.fileName, cleanMime);

    const buffer = Buffer.from(input.dataBase64, 'base64');
    const blob = new Blob([buffer], { type: cleanMime });
    const formData = new FormData();
    formData.append('file', blob, cleanFileName);
    formData.append('model', config.model);

    this.logger.info('[Audio] Transcribing with OpenAI/Whisper', {
      model: config.model,
      mimeType: cleanMime,
      fileName: cleanFileName,
    });

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: formData,
      });
    } catch (error) {
      throw new AudioTranscriptionError('audio_transcription_request_failed', {
        provider: config.provider,
        model: config.model,
        endpoint,
        cause: error,
      });
    }

    const responseText = await response.text();

    if (!response.ok) {
      throw new AudioTranscriptionError('audio_transcription_request_rejected', {
        provider: config.provider,
        model: config.model,
        endpoint,
        status: response.status,
        statusText: response.statusText,
        responseBody: truncateForLog(responseText, 1000),
      });
    }

    try {
      const data = JSON.parse(responseText);
      return (data.text || '').trim();
    } catch (error) {
      throw new AudioTranscriptionError('audio_transcription_invalid_json', {
        provider: config.provider,
        model: config.model,
        endpoint,
        status: response.status,
        statusText: response.statusText,
        responseBody: responseText.slice(0, 1000),
        cause: error,
      });
    }
  }
}
