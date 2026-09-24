import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { NpmRegistryStrategy } from '../../../../dist/application/ports/dependency-registry/npm-registry.strategy.js';

describe('Backend: Npm Registry Strategy', () => {
  let strategy;
  let originalFetch;

  beforeEach(() => {
    strategy = new NpmRegistryStrategy();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('fetchLatestVersion', () => {
    it('should fetch and parse npm package metadata', async () => {
      let capturedUrl = null;
      let capturedOptions = null;
      const mockResponse = {
        'dist-tags': {
          latest: '1.2.3',
        },
        repository: {
          url: 'https://github.com/example/package',
        },
      };

      globalThis.fetch = async (url, options) => {
        capturedUrl = url;
        capturedOptions = options;
        return {
          ok: true,
          json: async () => mockResponse,
        };
      };

      const result = await strategy.fetchLatestVersion('example-package');

      assert.equal(result.version, '1.2.3');
      assert.equal(result.repositoryUrl, 'https://github.com/example/package');
      assert.equal(capturedUrl, 'https://registry.npmjs.org/example-package');
      assert.equal(capturedOptions?.headers?.['User-Agent'], 'Kote-DependencyWatcher/1.0');
    });

    it('should handle packages without repository URL', async () => {
      const mockResponse = {
        'dist-tags': {
          latest: '2.0.0',
        },
      };

      globalThis.fetch = async () => ({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await strategy.fetchLatestVersion('no-repo-package');

      assert.equal(result.version, '2.0.0');
      assert.equal(result.repositoryUrl, undefined);
    });

    it('should clean git+https repository URLs', async () => {
      const mockResponse = {
        'dist-tags': {
          latest: '1.0.0',
        },
        repository: {
          url: 'git+https://github.com/example/package.git',
        },
      };

      globalThis.fetch = async () => ({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await strategy.fetchLatestVersion('git-repo-package');

      assert.equal(result.repositoryUrl, 'https://github.com/example/package');
    });

    it('should throw error when fetch fails', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        statusText: 'Not Found',
      });

      await assert.rejects(async () => {
        await strategy.fetchLatestVersion('nonexistent-package');
      });
    });

    it('should throw error when network error occurs', async () => {
      globalThis.fetch = async () => {
        throw new Error('Network error');
      };

      await assert.rejects(async () => {
        await strategy.fetchLatestVersion('network-error-package');
      }, /Network error/);
    });

    it('should handle malformed response gracefully', async () => {
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({ invalid: 'response' }),
      });

      await assert.rejects(async () => {
        await strategy.fetchLatestVersion('malformed-package');
      });
    });
  });
});
