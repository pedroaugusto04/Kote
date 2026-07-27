import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Injectable } from '@nestjs/common';

@Injectable()
export class VapidService {
  private publicKey: string = '';
  private privateKey: string = '';

  constructor() {
    this.initializeKeys();
  }

  private initializeKeys() {
    // 1. Try env first
    const envPub = process.env.KB_VAPID_PUBLIC_KEY;
    const envPriv = process.env.KB_VAPID_PRIVATE_KEY;

    if (envPub && envPriv) {
      this.publicKey = envPub;
      this.privateKey = envPriv;
      return;
    }

    // 2. Try to load from a local file in workspace to make it persistent across restarts
    const keyPath = path.join(process.cwd(), '.vapid-keys.json');
    if (fs.existsSync(keyPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        if (data.publicKey && data.privateKey) {
          this.publicKey = data.publicKey;
          this.privateKey = data.privateKey;
          return;
        }
      } catch {
        // ignore and regenerate
      }
    }

    // 3. Generate using Node's crypto
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.generateKeys();
    this.publicKey = ecdh.getPublicKey('base64url');
    this.privateKey = ecdh.getPrivateKey('base64url');

    try {
      fs.writeFileSync(keyPath, JSON.stringify({
        publicKey: this.publicKey,
        privateKey: this.privateKey
      }), 'utf8');
    } catch {
      // ignore
    }
  }

  getPublicKey(): string {
    return this.publicKey;
  }

  getPrivateKey(): string {
    return this.privateKey;
  }
}
