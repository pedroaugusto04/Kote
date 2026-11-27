import crypto from 'node:crypto';

export function sha256Hex(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function sha256Base64Url(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('base64url');
}

export function hmacSha256Base64Url(value: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

export function timingSafeEquals(actual: string, expected: string): boolean {
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export function encodeBase64Url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export function decodeBase64UrlJson(value: string): unknown {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
}
