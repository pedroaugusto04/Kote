import { describe, it, expect } from 'vitest';
import { redactSensitiveData, detectSensitiveData, redactWithDetection } from '../../../src/application/utils/sensitive-data-redactor.js';

describe('Backend: Sensitive Data Redactor', () => {
  describe('redactSensitiveData', () => {
    it('should redact password assignments', () => {
      const input = 'password=my_secret_pwd';
      const result = redactSensitiveData(input);
      expect(result).toBe('password=***');
    });

    it('should redact api keys', () => {
      const input = 'Configure api_key = sk-1234567890abcdef';
      const result = redactSensitiveData(input);
      expect(result).toContain('***');
      expect(result).not.toContain('sk-1234567890abcdef');
    });

    it('should redact database URLs with credentials', () => {
      const input = 'postgres://user:mypass123@db.example.com:5432/mydb';
      const result = redactSensitiveData(input);
      expect(result).toContain('***:***@');
      expect(result).not.toContain('mypass123');
    });

    it('should redact AWS secret keys', () => {
      const input = 'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
      const result = redactSensitiveData(input);
      expect(result).toBe('AWS_SECRET_ACCESS_KEY=***');
    });

    it('should redact private key blocks', () => {
      const input = 'My key:\n-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEF\n-----END PRIVATE KEY-----\nEnd';
      const result = redactSensitiveData(input);
      expect(result).toContain('[PRIVATE_KEY_REDACTED]');
      expect(result).not.toContain('-----BEGIN PRIVATE KEY-----');
    });

    it('should not redact normal text', () => {
      const input = 'This is a normal conversation without any secrets';
      const result = redactSensitiveData(input);
      expect(result).toBe(input);
    });

    it('should handle multiple sensitive patterns', () => {
      const input = 'password=secret123 and api_key=key456 and Bearer token789';
      const result = redactSensitiveData(input);
      expect(result).toContain('password=***');
      expect(result).toContain('api_key=***');
      expect(result).toContain('Bearer ***');
    });
  });

  describe('detectSensitiveData', () => {
    it('should detect password patterns', () => {
      const detected = detectSensitiveData('password=secret');
      expect(detected).toContain('password-assignment');
    });

    it('should detect api key patterns', () => {
      const detected = detectSensitiveData('api_key=abc123');
      expect(detected.some(p => p.includes('api-key'))).toBe(true);
    });

    it('should return empty array for clean text', () => {
      const detected = detectSensitiveData('This is normal conversation');
      expect(detected.length).toBe(0);
    });

    it('should detect multiple patterns', () => {
      const detected = detectSensitiveData('password=x api_key=y Bearer token');
      expect(detected.length).toBeGreaterThan(0);
    });
  });

  describe('redactWithDetection', () => {
    it('should return both sanitized text and detected patterns', () => {
      const input = 'password=secret123 here';
      const { sanitized, detected } = redactWithDetection(input);
      
      expect(sanitized).toBe('password=*** here');
      expect(detected).toContain('password-assignment');
    });

    it('should return empty detected array for clean text', () => {
      const input = 'This is clean';
      const { sanitized, detected } = redactWithDetection(input);
      
      expect(sanitized).toBe(input);
      expect(detected.length).toBe(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle null/undefined gracefully', () => {
      expect(redactSensitiveData(null as any)).toBe(null);
      expect(redactSensitiveData(undefined as any)).toBe(undefined);
      expect(detectSensitiveData(null as any).length).toBe(0);
    });

    it('should handle empty strings', () => {
      expect(redactSensitiveData('')).toBe('');
      expect(detectSensitiveData('').length).toBe(0);
    });

    it('should handle URLs with user:pass format', () => {
      const input = 'https://admin:password123@api.example.com';
      const result = redactSensitiveData(input);
      expect(result).toContain('***:***@');
    });

    it('should handle MySQL connection strings', () => {
      const input = 'mysql://root:mypassword@localhost:3306/db';
      const result = redactSensitiveData(input);
      expect(result).toContain('***:***@');
    });

    it('should handle JWT tokens', () => {
      const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const result = redactSensitiveData(input);
      expect(result).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
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
      expect(result).not.toContain('supersecret');
      expect(result).not.toContain('sk-abc123');
      expect(result).not.toContain('pass@db.internal');
      expect(result).not.toContain('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
    });

    it('should preserve conversation structure while redacting', () => {
      const input = 'Today I configured the API with token=abc123xyz. The setup was successful.';
      const result = redactSensitiveData(input);
      expect(result).toContain('Today I configured');
      expect(result).toContain('The setup was successful');
      expect(result).toContain('token=***');
    });
  });
});
