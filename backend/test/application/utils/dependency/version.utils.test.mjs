import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { cleanVersion } from '../../../../dist/application/utils/dependency/version.utils.js';

describe('Backend: Dependency Version Utils', () => {
  describe('cleanVersion', () => {
    it('should remove caret prefix', () => {
      assert.equal(cleanVersion('^1.2.3'), '1.2.3');
    });

    it('should remove tilde prefix', () => {
      assert.equal(cleanVersion('~2.5.0'), '2.5.0');
    });

    it('should handle versions without prefixes', () => {
      assert.equal(cleanVersion('3.0.0'), '3.0.0');
    });

    it('should handle complex version strings', () => {
      assert.equal(cleanVersion('^1.2.3-alpha.1'), '1.2.3-alpha.1');
    });

    it('should handle versions with build metadata', () => {
      assert.equal(cleanVersion('~2.0.0+build.123'), '2.0.0+build.123');
    });

    it('should handle empty strings', () => {
      assert.equal(cleanVersion(''), '');
    });

    it('should handle versions with both caret and tilde (edge case)', () => {
      assert.equal(cleanVersion('^~1.0.0'), '1.0.0');
    });
  });
});
