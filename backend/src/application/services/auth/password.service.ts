import { promisify } from 'node:util';
import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';

const scrypt = promisify(crypto.scrypt);

@Injectable()
export class PasswordService {
  async hashPassword(password: string): Promise<string> {
    const salt = crypto.randomBytes(16).toString('base64url');
    const derived = (await scrypt(password, salt, 64)) as Buffer;
    return `scrypt$${salt}$${derived.toString('base64url')}`;
  }

  async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    const [algorithm, salt, hash] = storedHash.split('$');
    if (algorithm !== 'scrypt' || !salt || !hash) return false;
    const derived = (await scrypt(password, salt, 64)) as Buffer;
    const expected = Buffer.from(hash, 'base64url');
    return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
  }
}
