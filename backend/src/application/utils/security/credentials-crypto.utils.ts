import crypto from 'node:crypto';
import type { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';

export type EncryptedConfig = {
  iv: string;
  authTag: string;
  ciphertext: string;
  keyVersion: number;
};

export function encryptionKey(environmentProvider: RuntimeEnvironmentProvider): Buffer {
  const key = Buffer.from(environmentProvider.read().credentialsEncryptionKey, 'base64');
  if (key.length !== 32) throw new Error('credentials_encryption_key_must_be_32_bytes_base64');
  return key;
}

export function encryptConfig(config: Record<string, unknown>, environmentProvider: RuntimeEnvironmentProvider): EncryptedConfig {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(environmentProvider), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(config), 'utf8'), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    keyVersion: 1,
  };
}

export function decryptConfig(encrypted: unknown, environmentProvider: RuntimeEnvironmentProvider): Record<string, unknown> {
  const payload = encrypted as EncryptedConfig;
  if (!payload?.iv || !payload.authTag || !payload.ciphertext) throw new Error('invalid_encrypted_config');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(environmentProvider), Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
  const cleartext = Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  return JSON.parse(cleartext) as Record<string, unknown>;
}
