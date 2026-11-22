import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  isTrustedRepositoryUrl,
  extractRepositoryUrl,
} from '../../../../dist/application/utils/dependency/repository-url.utils.js';

describe('Backend: Repository URL Utils', () => {
  describe('isTrustedRepositoryUrl', () => {
    it('accepts valid github.com and gitlab.com urls', () => {
      assert.equal(isTrustedRepositoryUrl('https://github.com/user/repo'), true);
      assert.equal(isTrustedRepositoryUrl('https://gitlab.com/user/repo'), true);
      assert.equal(isTrustedRepositoryUrl('http://github.com/user/repo'), true);
      assert.equal(isTrustedRepositoryUrl('github.com/user/repo'), true);
      assert.equal(isTrustedRepositoryUrl('raw.github.com/user/repo'), true);
    });

    it('rejects spoofed or untrusted domains', () => {
      assert.equal(isTrustedRepositoryUrl('https://evil-github.com/repo'), false);
      assert.equal(isTrustedRepositoryUrl('https://attacker.com?query=github.com'), false);
      assert.equal(isTrustedRepositoryUrl('https://not-gitlab.com'), false);
      assert.equal(isTrustedRepositoryUrl(''), false);
      assert.equal(isTrustedRepositoryUrl(undefined), false);
    });
  });

  describe('extractRepositoryUrl', () => {
    it('extracts and normalizes git ssh urls', () => {
      assert.equal(
        extractRepositoryUrl('git@github.com:pedro/kote.git'),
        'https://github.com/pedro/kote',
      );
    });

    it('normalizes git+https urls', () => {
      assert.equal(
        extractRepositoryUrl('git+https://github.com/pedro/kote.git'),
        'https://github.com/pedro/kote',
      );
    });

    it('uses homepage only when domain is trusted', () => {
      assert.equal(
        extractRepositoryUrl(undefined, 'https://github.com/pedro/kote'),
        'https://github.com/pedro/kote',
      );
      assert.equal(
        extractRepositoryUrl(undefined, 'https://evil-github.com/fake'),
        '',
      );
    });
  });
});
