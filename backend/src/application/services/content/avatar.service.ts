import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';

import { ObjectStorage, ObjectStorageMissingContentError } from '../../ports/notes/object-storage.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';

export const avatarMaxSizeBytes = 3 * 1024 * 1024;
const avatarMimeTypes = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
]);
const avatarStorageReadAttempts = 5;
const avatarStorageReadDelayMs = 150;

export type AvatarContent = {
  body: Buffer;
  mimeType: string;
};

@Injectable()
export class AvatarService {
  private maxAvatarSizeBytes: number;

  constructor(
    private readonly objectStorage: ObjectStorage,
    private readonly environmentProvider: RuntimeEnvironmentProvider = { read: () => ({ avatarMaxSizeBytes: 3 * 1024 * 1024 }) as any },
  ) {
    this.maxAvatarSizeBytes = this.environmentProvider.read().avatarMaxSizeBytes;
  }

  private requireAvatarStorage(): ObjectStorage {
    if (!this.objectStorage) throw new Error('avatar_storage_not_configured');
    return this.objectStorage;
  }

  private avatarStorageKey(userId: string, mimeType: string): string {
    const extension = avatarMimeTypes.get(mimeType);
    if (!extension) throw new BadRequestException('unsupported_avatar_type');
    return `users/${userId}/profile/avatar-${Date.now()}.${extension}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async getStoredAvatarWithRetry(storageKey: string): Promise<Buffer> {
    const storage = this.requireAvatarStorage();
    let lastError: unknown;
    for (let attempt = 1; attempt <= avatarStorageReadAttempts; attempt += 1) {
      try {
        return await storage.get(storageKey);
      } catch (error) {
        lastError = error;
        if (!(error instanceof ObjectStorageMissingContentError) || attempt === avatarStorageReadAttempts) break;
        await this.delay(avatarStorageReadDelayMs);
      }
    }
    throw lastError;
  }

  async uploadAvatar(input: {
    userId: string;
    buffer: Buffer;
    mimeType: string;
    sizeBytes: number;
    previousStorageKey: string | null;
  }): Promise<{ storageKey: string; mimeType: string; sizeBytes: number }> {
    if (!avatarMimeTypes.has(input.mimeType)) throw new BadRequestException('unsupported_avatar_type');
    if (!input.buffer.length || input.sizeBytes <= 0) throw new BadRequestException('avatar_file_required');
    if (input.sizeBytes > this.maxAvatarSizeBytes || input.buffer.length > this.maxAvatarSizeBytes) throw new BadRequestException('avatar_file_too_large');

    const storage = this.requireAvatarStorage();
    const storageKey = this.avatarStorageKey(input.userId, input.mimeType);
    await storage.put({ key: storageKey, body: input.buffer, contentType: input.mimeType });
    await this.getStoredAvatarWithRetry(storageKey);

    if (input.previousStorageKey && input.previousStorageKey !== storageKey) {
      await storage.delete(input.previousStorageKey).catch(() => undefined);
    }

    return { storageKey, mimeType: input.mimeType, sizeBytes: input.sizeBytes };
  }

  async deleteAvatar(storageKey: string | null): Promise<void> {
    if (!storageKey) return;
    await this.requireAvatarStorage().delete(storageKey).catch(() => undefined);
  }

  async getAvatarContent(storageKey: string): Promise<AvatarContent> {
    if (!storageKey) throw new NotFoundException('avatar_not_found');
    try {
      const body = await this.getStoredAvatarWithRetry(storageKey);
      const extension = storageKey.split('.').pop()?.toLowerCase() || 'png';
      const mimeTypeMap: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
      const mimeType = mimeTypeMap[extension] || 'image/png';
      return { body, mimeType };
    } catch (error) {
      if (error instanceof ObjectStorageMissingContentError) throw new NotFoundException('avatar_not_found');
      throw error;
    }
  }

  isMimeTypeSupported(mimeType: string): boolean {
    return avatarMimeTypes.has(mimeType);
  }

  getMaxSizeBytes(): number {
    return this.maxAvatarSizeBytes;
  }
}
