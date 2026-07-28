import { describe, it, expect } from 'vitest';
import { cleanVersion } from '../../../../src/application/utils/dependency/version.utils.js';

describe('Backend: Dependency Version Utils', () => {
  describe('cleanVersion', () => {
    it('should remove caret prefix', () => {
      expect(cleanVersion('^1.2.3')).toBe('1.2.3');
    });

    it('should remove tilde prefix', () => {
      expect(cleanVersion('~2.5.0')).toBe('2.5.0');
    });

    it('should handle versions without prefixes', () => {
      expect(cleanVersion('3.0.0')).toBe('3.0.0');
    });

    it('should handle complex version strings', () => {
      expect(cleanVersion('^1.2.3-alpha.1')).toBe('1.2.3-alpha.1');
    });

    it('should handle versions with build metadata', () => {
      expect(cleanVersion('~2.0.0+build.123')).toBe('2.0.0+build.123');
    });

    it('should handle empty strings', () => {
      expect(cleanVersion('')).toBe('');
    });

    it('should handle versions with both caret and tilde (edge case)', () => {
      expect(cleanVersion('^~1.0.0')).toBe('1.0.0');
    });
  });
});
