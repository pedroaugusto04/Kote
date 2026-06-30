import { Injectable, Optional, InternalServerErrorException } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';

import { ObjectStorage, ObjectStorageMissingContentError, type ObjectStoragePutInput } from '../../application/ports/notes/object-storage.js';
import { SUPABASE_STORAGE_DEFAULTS, SUPABASE_STORAGE_ERRORS } from './supabase-storage.constants.js';

type SupabaseStorageConfig = {
  url: string;
  serviceRoleKey: string;
  bucket: string;
  cacheControl: string;
};

type SupabaseStorageUploadOptions = {
  cacheControl?: string;
  contentType?: string;
  upsert?: boolean;
};

type SupabaseStorageBucketClient = {
  upload(path: string, body: string | Uint8Array, options?: SupabaseStorageUploadOptions): Promise<{ error: unknown | null }>;
  download(path: string): Promise<{ data: Blob | null; error: unknown | null }>;
  remove(paths: string[]): Promise<{ error: unknown | null }>;
};

type SupabaseStorageClientFactory = (config: SupabaseStorageConfig) => SupabaseStorageBucketClient;

function readConfig(env = process.env): SupabaseStorageConfig {
  return {
    url: String(env.SUPABASE_URL || '').trim().replace(/\/$/, ''),
    serviceRoleKey: String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
    bucket: String(env.KB_SUPABASE_STORAGE_BUCKET || '').trim(),
    cacheControl: String(env.KB_SUPABASE_CACHE_CONTROL || SUPABASE_STORAGE_DEFAULTS.CACHE_CONTROL).trim(),
  };
}

function requireConfig(config: SupabaseStorageConfig) {
  if (!config.url) throw new InternalServerErrorException(SUPABASE_STORAGE_ERRORS.URL_NOT_CONFIGURED);
  if (!config.serviceRoleKey) throw new InternalServerErrorException(SUPABASE_STORAGE_ERRORS.SERVICE_ROLE_KEY_NOT_CONFIGURED);
  if (!config.bucket) throw new InternalServerErrorException(SUPABASE_STORAGE_ERRORS.BUCKET_NOT_CONFIGURED);
}

function createSupabaseStorageClient(config: SupabaseStorageConfig): SupabaseStorageBucketClient {
  const client = createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return client.storage.from(config.bucket);
}

function uploadBody(body: Buffer | string): string | Uint8Array {
  if (typeof body === 'string') return body;
  return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
}

function readErrorStatusCode(error: unknown): number | null {
  const raw = typeof error === 'object' && error !== null && 'statusCode' in error
    ? (error as { statusCode?: unknown }).statusCode
    : undefined;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return SUPABASE_STORAGE_ERRORS.UNKNOWN;
}

function buildStorageError(prefix: string, error: unknown): Error {
  const statusCode = readErrorStatusCode(error);
  const message = readErrorMessage(error);
  return new Error(`${prefix}:${statusCode ?? 'unknown'}:${message}`);
}

@Injectable()
export class SupabaseObjectStorage extends ObjectStorage {
  constructor(@Optional() private readonly createStorageClient: SupabaseStorageClientFactory = createSupabaseStorageClient) {
    super();
  }

  async put(input: ObjectStoragePutInput): Promise<void> {
    const config = readConfig();
    requireConfig(config);
    const storage = this.createStorageClient(config);
    const contentType = input.contentType || SUPABASE_STORAGE_DEFAULTS.CONTENT_TYPE;

    const { error } = await storage.upload(input.key, uploadBody(input.body), {
      cacheControl: config.cacheControl,
      contentType,
      upsert: true,
    });
    if (error) throw buildStorageError(SUPABASE_STORAGE_ERRORS.PUT_FAILED, error);
  }

  async get(key: string): Promise<Buffer> {
    const config = readConfig();
    requireConfig(config);
    const storage = this.createStorageClient(config);
    const { data, error } = await storage.download(key);
    if (error) {
      if (readErrorStatusCode(error) === 404) throw new ObjectStorageMissingContentError(key);
      throw buildStorageError(SUPABASE_STORAGE_ERRORS.GET_FAILED, error);
    }
    if (!data) throw new InternalServerErrorException('internal_server_error');
    return Buffer.from(await data.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    const config = readConfig();
    requireConfig(config);
    const storage = this.createStorageClient(config);
    const { error } = await storage.remove([key]);
    if (readErrorStatusCode(error) === 404) return;
    if (error) throw buildStorageError(SUPABASE_STORAGE_ERRORS.DELETE_FAILED, error);
  }
}
