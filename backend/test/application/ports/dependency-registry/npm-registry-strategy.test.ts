import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NpmRegistryStrategy } from '../../../../src/application/ports/dependency-registry/npm-registry.strategy.js';

describe('Backend: Npm Registry Strategy', () => {
  let strategy: NpmRegistryStrategy;

  beforeEach(() => {
    strategy = new NpmRegistryStrategy();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('fetchLatestVersion', () => {
    it('should fetch and parse npm package metadata', async () => {
      const mockResponse = {
        'dist-tags': {
          latest: '1.2.3',
        },
        repository: {
          url: 'https://github.com/example/package',
        },
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await strategy.fetchLatestVersion('example-package');

      expect(result).toEqual({
        version: '1.2.3',
        repositoryUrl: 'https://github.com/example/package',
      });
      expect(fetch).toHaveBeenCalledWith(
        'https://registry.npmjs.org/example-package',
      );
    });

    it('should handle packages without repository URL', async () => {
      const mockResponse = {
        'dist-tags': {
          latest: '2.0.0',
        },
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await strategy.fetchLatestVersion('no-repo-package');

      expect(result.version).toBe('2.0.0');
      expect(result.repositoryUrl).toBe('');
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

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await strategy.fetchLatestVersion('git-repo-package');

      expect(result.repositoryUrl).toBe('https://github.com/example/package');
    });

    it('should throw error when fetch fails', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 404,
      } as Response);

      await expect(strategy.fetchLatestVersion('nonexistent-package')).rejects.toThrow();
    });

    it('should throw error when network error occurs', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

      await expect(strategy.fetchLatestVersion('network-error-package')).rejects.toThrow('Network error');
    });

    it('should handle malformed response gracefully', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ invalid: 'response' }),
      } as Response);

      await expect(strategy.fetchLatestVersion('malformed-package')).rejects.toThrow();
    });
  });
});
