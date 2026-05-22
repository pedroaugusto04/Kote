import type { Request } from 'express';

export function requestIp(request: Request): string {
  const forwardedFor = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwardedFor || request.ip || request.socket.remoteAddress || 'unknown';
}
