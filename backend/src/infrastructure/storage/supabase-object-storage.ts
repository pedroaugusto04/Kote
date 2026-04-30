import { Injectable } from '@nestjs/common';

import { ObjectStorage, ObjectStorageMissingContentError, type ObjectStoragePutInput } from '../../application/ports/object-storage.js';

type SupabaseStorageConfig = {
  url: string;
  serviceRoleKey: string;
  bucket: string;
  cacheControl: string;
};

function readConfig(env = process.env): SupabaseStorageConfig {
  return {
    url: String(env.SUPABASE_URL || '').trim().replace(/\/$/, ''),
    serviceRoleKey: String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
    bucket: String(env.KB_SUPABASE_STORAGE_BUCKET || '').trim(),
    cacheControl: String(env.KB_SUPABASE_CACHE_CONTROL || '31536000').trim(),
  };
}

function requireConfig(config: SupabaseStorageConfig) {
  if (!config.url) throw new Error('SUPABASE_URL_not_configured');
  if (!config.serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY_not_configured');
  if (!config.bucket) throw new Error('KB_SUPABASE_STORAGE_BUCKET_not_configured');
}

function encodeObjectPath(key: string): string {
  return key
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function fetchBody(body: Buffer | string): BodyInit {
  if (typeof body === 'string') return body;
  return new Uint8Array(body.buffer, body.byteOffset, body.byteLength) as BodyInit;
}

@Injectable()
export class SupabaseObjectStorage extends ObjectStorage {
  private objectUrl(config: SupabaseStorageConfig, key: string): string {
    const encodedBucket = encodeURIComponent(config.bucket);
    const encodedPath = encodeObjectPath(key);
    return `${config.url}/storage/v1/object/${encodedBucket}/${encodedPath}`;
  }

  async put(input: ObjectStoragePutInput): Promise<void> {
    const config = readConfig();
    requireConfig(config);
    const response = await fetch(this.objectUrl(config, input.key), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.serviceRoleKey}`,
        apikey: config.serviceRoleKey,
        'cache-control': config.cacheControl,
        'content-type': input.contentType || 'application/octet-stream',
        'x-upsert': 'true',
      },
      body: fetchBody(input.body),
    });
    if (!response.ok) throw new Error(`supabase_storage_put_failed:${response.status}:${await response.text()}`);
  }

  async get(key: string): Promise<Buffer> {
    const config = readConfig();
    requireConfig(config);
    const response = await fetch(this.objectUrl(config, key), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.serviceRoleKey}`,
        apikey: config.serviceRoleKey,
      },
    });
    if (response.status === 404) throw new ObjectStorageMissingContentError(key);
    if (!response.ok) throw new Error(`supabase_storage_get_failed:${response.status}:${await response.text()}`);
    return Buffer.from(await response.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    const config = readConfig();
    requireConfig(config);
    const response = await fetch(this.objectUrl(config, key), {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${config.serviceRoleKey}`,
        apikey: config.serviceRoleKey,
      },
    });
    if (response.status === 404) return;
    if (!response.ok) throw new Error(`supabase_storage_delete_failed:${response.status}:${await response.text()}`);
  }
}
