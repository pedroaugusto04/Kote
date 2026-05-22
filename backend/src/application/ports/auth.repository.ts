import type { AuthIdentityRecord, KbUser } from '../models/repository-records.models.js';

export abstract class SchemaMigrator {
  abstract migrate(): Promise<void>;
}

export abstract class UserRepository {
  abstract findUserByEmail(email: string): Promise<KbUser | null>;
  abstract findUserById(id: string): Promise<KbUser | null>;
  abstract createUser(input: { email: string; displayName?: string; passwordHash?: string | null; role: string }): Promise<KbUser>;
  abstract updateUserAvatar(input: { userId: string; storageKey: string; mimeType: string; sizeBytes: number }): Promise<KbUser | null>;
  abstract clearUserAvatar(userId: string): Promise<KbUser | null>;
  abstract findAuthIdentity(provider: string, providerUserId: string): Promise<AuthIdentityRecord | null>;
  abstract findUserAuthIdentity(userId: string, provider: string): Promise<AuthIdentityRecord | null>;
  abstract createAuthIdentity(input: {
    provider: string;
    providerUserId: string;
    userId: string;
    email: string;
    emailVerified: boolean;
    displayName?: string;
    metadata?: Record<string, unknown>;
  }): Promise<AuthIdentityRecord>;
}
