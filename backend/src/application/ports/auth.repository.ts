import type { KbUser } from '../models/repository-records.models.js';

export abstract class SchemaMigrator {
  abstract migrate(): Promise<void>;
}

export abstract class UserRepository {
  abstract findUserByEmail(email: string): Promise<KbUser | null>;
  abstract findUserById(id: string): Promise<KbUser | null>;
  abstract createUser(input: { email: string; displayName?: string; passwordHash: string; role: string }): Promise<KbUser>;
}
