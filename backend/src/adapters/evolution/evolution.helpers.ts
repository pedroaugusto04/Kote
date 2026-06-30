import { BadRequestException } from '@nestjs/common';
import { readEnvironment } from '../environment.js';

export interface EvolutionConfig {
  apiUrl: string;
  apiKey: string;
  instanceName: string;
}

export interface EvolutionMessageBody {
  data?: unknown;
  base64?: unknown;
  response?: unknown;
}

export interface EvolutionMediaInput {
  mediaBase64: string;
  fileName?: string;
  mimeType?: string;
  mediaType: string;
  caption?: string;
}

export interface ProcessedMedia {
  mediaValue: string;
  fileName: string;
  isUrl: boolean;
}

export function extractBase64FromDataUrl(dataUrl: string): string {
  const marker = ';base64,';
  const markerIndex = dataUrl.indexOf(marker);
  return markerIndex >= 0 ? dataUrl.slice(markerIndex + marker.length).trim() : dataUrl;
}

export function normalizeMimeTypeExtension(mimeType: string): string {
  const parts = mimeType.split('/');
  if (parts.length === 2) {
    const ext = parts[1].toLowerCase();
    return ext === 'jpeg' ? 'jpg' : ext;
  }
  return '';
}

export function normalizeFileName(fileName: string, mimeType?: string): string {
  const extension = mimeType ? normalizeMimeTypeExtension(mimeType) : '';
  const lastDotIndex = fileName.lastIndexOf('.');
  const currentExt = lastDotIndex !== -1 ? fileName.slice(lastDotIndex + 1).toLowerCase() : '';
  const genericExtensions = ['image', 'video', 'audio', 'document', 'sticker'];

  if (lastDotIndex === -1 || genericExtensions.includes(currentExt)) {
    const baseName = lastDotIndex === -1 ? fileName : fileName.slice(0, lastDotIndex);
    if (extension) {
      return `${baseName}.${extension}`;
    }
  }

  return fileName;
}

export function isValidUrl(value: string): boolean {
  return /^(https?|ftp):\/\//i.test(value);
}

export function processMediaInput(input: EvolutionMediaInput): ProcessedMedia {
  let mediaValue = input.mediaBase64;
  const isUrl = isValidUrl(mediaValue);
  
  if (!isUrl) {
    mediaValue = extractBase64FromDataUrl(mediaValue);
  }

  const fileName = normalizeFileName(input.fileName || 'attachment', input.mimeType);

  return { mediaValue, fileName, isUrl };
}

export function evolutionMessagePayload(body: EvolutionMessageBody): EvolutionMessageBody {
  const data = body.data;
  if (Array.isArray(data)) {
    const first = data.find((entry) => entry && typeof entry === 'object' && !Array.isArray(entry));
    return first ? (first as EvolutionMessageBody) : body;
  }
  if (data && typeof data === 'object') return data as EvolutionMessageBody;
  return body;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function base64Value(value: unknown): string {
  const raw = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  return extractBase64FromDataUrl(raw);
}

export function extractBase64(json: EvolutionMessageBody): string {
  const data = objectValue(json.data);
  const response = objectValue(json.response);
  return base64Value(
    json.base64 ||
      data?.base64 ||
      response?.base64,
  );
}

export function getEvolutionConfig(): EvolutionConfig | null {
  const environment = readEnvironment();
  if (!environment.evolutionApiUrl || !environment.evolutionApiKey || !environment.evolutionInstanceName) {
    return null;
  }
  return {
    apiUrl: environment.evolutionApiUrl.replace(/\/+$/, ''),
    apiKey: environment.evolutionApiKey,
    instanceName: environment.evolutionInstanceName,
  };
}

export function buildEvolutionUrl(config: EvolutionConfig, endpoint: string): string {
  return `${config.apiUrl}/${endpoint}/${encodeURIComponent(config.instanceName)}`;
}
