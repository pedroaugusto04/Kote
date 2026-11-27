import { Injectable } from '@nestjs/common';

import { calculateAttachmentSize } from '../../../../domain/strings.js';
import type { ConversationInput } from '../../../../contracts/conversation.js';
import { WhatsappMediaDownloader } from '../../../ports/integrations/whatsapp-media.downloader.js';
import { AudioTranscriptionGateway } from '../../../ports/audio/audio-transcription.gateway.js';
import { RuntimeEnvironmentProvider } from '../../../ports/observability/runtime-environment.port.js';
import { AppLogger } from '../../../../observability/logger.js';

export interface WhatsappMediaEnrichmentInput {
  externalId: string;
  rawPayload: Record<string, unknown>;
  input: ConversationInput;
}

@Injectable()
export class WhatsappMediaProcessorService {
  constructor(
    private readonly whatsappMediaDownloader: WhatsappMediaDownloader,
    private readonly audioTranscriptionGateway: AudioTranscriptionGateway,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly logger: AppLogger,
  ) {}

  async enrichConversationInput(params: WhatsappMediaEnrichmentInput): Promise<ConversationInput> {
    const downloadedInput = await this.downloadMediaIfNeeded(
      params.externalId,
      params.rawPayload,
      params.input,
    );
    return this.transcribeAudioIfNeeded(downloadedInput);
  }

  async downloadMediaIfNeeded(
    externalId: string,
    rawPayload: Record<string, unknown>,
    input: ConversationInput,
  ): Promise<ConversationInput> {
    if (!input.hasMedia || input.media.dataBase64 || !this.whatsappMediaDownloader) {
      return input;
    }

    const result = await this.whatsappMediaDownloader.downloadBase64({ body: rawPayload });
    if (!result.ok) {
      this.logger.warn('whatsapp.media.download_failed', {
        externalId,
        chatId: input.chatId,
        messageId: input.messageId,
        error: result.error,
      });
      return input;
    }

    const sizeBytes = calculateAttachmentSize(input.media.sizeBytes, result.dataBase64);
    return {
      ...input,
      media: {
        ...input.media,
        dataBase64: result.dataBase64,
        sizeBytes,
      },
    };
  }

  async transcribeAudioIfNeeded(input: ConversationInput): Promise<ConversationInput> {
    if (
      input.messageText
      || !input.hasMedia
      || !input.media.dataBase64
      || !input.media.mimeType.startsWith('audio/')
    ) {
      return input;
    }

    const environment = this.environmentProvider.read();
    if (!environment.audioAiProvider || environment.audioAiProvider === 'none') {
      return input;
    }

    try {
      const transcription = await this.audioTranscriptionGateway.transcribe(
        {
          provider: environment.audioAiProvider,
          baseUrl: environment.audioAiBaseUrl,
          model: environment.audioAiModel,
          apiKey: environment.audioAiApiKey,
        },
        {
          dataBase64: input.media.dataBase64,
          mimeType: input.media.mimeType,
          fileName: input.media.fileName,
        },
      );
      if (transcription) {
        this.logger.info('whatsapp.audio.transcribed', {
          messageId: input.messageId,
          textLength: transcription.length,
        });
        return {
          ...input,
          messageText: transcription,
        };
      }
    } catch (transcriptionError) {
      this.logger.error('whatsapp.audio.transcription_failed', {
        messageId: input.messageId,
        error: transcriptionError instanceof Error ? transcriptionError.message : String(transcriptionError),
      });
    }

    return input;
  }
}
