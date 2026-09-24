import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  redactSensitiveData,
  detectSensitiveData,
  redactWithDetection,
} from '../../../dist/application/utils/security/sensitive-data-redactor.js';

describe('Backend: Sensitive Data Redactor', () => {
  describe('redactSensitiveData', () => {
    it('should redact password assignments', () => {
      const input = 'password=my_secret_pwd';
      const result = redactSensitiveData(input);
      assert.equal(result, 'password=***');
    });

    it('should redact api keys', () => {
      const input = 'Configure api_key = sk-1234567890abcdef';
      const result = redactSensitiveData(input);
      assert.ok(result.includes('***'));
      assert.ok(!result.includes('sk-1234567890abcdef'));
    });

    it('should redact database URLs with credentials', () => {
      const input = 'postgres://user:mypass123@db.example.com:5432/mydb';
      const result = redactSensitiveData(input);
      assert.ok(result.includes('***:***@'));
      assert.ok(!result.includes('mypass123'));
    });

    it('should redact AWS secret keys', () => {
      const input = 'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
      const result = redactSensitiveData(input);
      assert.equal(result, 'AWS_SECRET_ACCESS_KEY=***');
    });

    it('should redact private key blocks', () => {
      const input = 'My key:\n-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEF\n-----END PRIVATE KEY-----\nEnd';
      const result = redactSensitiveData(input);
      assert.ok(result.includes('[PRIVATE_KEY_REDACTED]'));
      assert.ok(!result.includes('-----BEGIN PRIVATE KEY-----'));
    });

    it('should not redact normal text', () => {
      const input = 'This is a normal conversation without any secrets';
      const result = redactSensitiveData(input);
      assert.equal(result, input);
    });

    it('should handle multiple sensitive patterns', () => {
      const input = 'password=secret123 and api_key=key456 and Bearer token789';
      const result = redactSensitiveData(input);
      assert.ok(result.includes('password=***'));
      assert.ok(result.includes('api_key=***'));
      assert.ok(result.includes('Bearer ***'));
    });
  });

  describe('detectSensitiveData', () => {
    it('should detect password patterns', () => {
      const detected = detectSensitiveData('password=secret');
      assert.ok(detected.includes('password-assignment'));
    });

    it('should detect api key patterns', () => {
      const detected = detectSensitiveData('api_key=abc123');
      assert.ok(detected.some((p) => p.includes('api-key')));
    });

    it('should return empty array for clean text', () => {
      const detected = detectSensitiveData('This is normal conversation');
      assert.equal(detected.length, 0);
    });

    it('should detect multiple patterns', () => {
      const detected = detectSensitiveData('password=x api_key=y Bearer token');
      assert.ok(detected.length > 0);
    });
  });

  describe('redactWithDetection', () => {
    it('should return both sanitized text and detected patterns', () => {
      const input = 'password=secret123 here';
      const { sanitized, detected } = redactWithDetection(input);

      assert.equal(sanitized, 'password=*** here');
      assert.ok(detected.includes('password-assignment'));
    });

    it('should return empty detected array for clean text', () => {
      const input = 'This is clean';
      const { sanitized, detected } = redactWithDetection(input);

      assert.equal(sanitized, input);
      assert.equal(detected.length, 0);
    });
  });

  describe('Edge cases', () => {
    it('should handle null/undefined gracefully', () => {
      assert.equal(redactSensitiveData(null), null);
      assert.equal(redactSensitiveData(undefined), undefined);
      assert.equal(detectSensitiveData(null).length, 0);
    });

    it('should handle empty strings', () => {
      assert.equal(redactSensitiveData(''), '');
      assert.equal(detectSensitiveData('').length, 0);
    });

    it('should handle URLs with user:pass format', () => {
      const input = 'https://admin:password123@api.example.com';
      const result = redactSensitiveData(input);
      assert.ok(result.includes('***:***@'));
    });

    it('should handle MySQL connection strings', () => {
      const input = 'mysql://root:mypassword@localhost:3306/db';
      const result = redactSensitiveData(input);
      assert.ok(result.includes('***:***@'));
    });

    it('should handle JWT tokens', () => {
      const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const result = redactSensitiveData(input);
      assert.ok(!result.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'));
    });
  });

  describe('Real-world scenarios', () => {
    it('should sanitize AI conversation with credentials', () => {
      const input = `
I configured the database with password=supersecret and api_key=sk-abc123.
The connection string is postgresql://user:pass@db.internal:5432/myapp.
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY should never be shared.
      `;
      const result = redactSensitiveData(input);
      assert.ok(!result.includes('supersecret'));
      assert.ok(!result.includes('sk-abc123'));
      assert.ok(!result.includes('pass@db.internal'));
      assert.ok(!result.includes('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'));
    });

    it('should preserve conversation structure while redacting', () => {
      const input = 'Today I configured the API with token=abc123xyz. The setup was successful.';
      const result = redactSensitiveData(input);
      assert.ok(result.includes('Today I configured'));
      assert.ok(result.includes('The setup was successful'));
      assert.ok(result.includes('token=***'));
    });
  });
});
