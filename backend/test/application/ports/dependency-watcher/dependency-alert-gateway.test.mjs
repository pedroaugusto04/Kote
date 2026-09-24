import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { DefaultDependencyAlertGateway } from '../../../../dist/infrastructure/ai/dependency-alert.gateway.js';
import { AiProvider } from '../../../../dist/contracts/enums.js';
import { DependencyUrgency } from '../../../../dist/contracts/enums.js';

describe('Backend: Dependency Alert Gateway', () => {
  let gateway;
  let originalFetch;
  let mockAiResponse;

  beforeEach(() => {
    gateway = new DefaultDependencyAlertGateway();
    originalFetch = globalThis.fetch;
    mockAiResponse = null;

    globalThis.fetch = async (url, options) => {
      return {
        ok: true,
        text: async () => JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify(mockAiResponse),
              },
            },
          ],
        }),
      };
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('Business Rules', () => {
    const mockConfig = {
      provider: AiProvider.OpenAi,
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4',
      apiKey: 'sk-test-key',
    };

    const mockPayload = {
      packageName: 'express',
      currentVersion: '4.18.0',
      latestVersion: '4.19.0',
      changelog: 'Fixed security vulnerability in middleware parsing',
      ecosystem: 'npm',
    };

    const baseResult = {
      urgency: 'recommended',
      summary: 'express 4.18.0 to 4.19.0 includes middleware parsing fixes',
      breakingChanges: ['Removed deprecated middleware'],
      nextSteps: ['Update to latest version', 'Test middleware compatibility'],
    };

    it('should analyze changelog and return urgency assessment', async () => {
      mockAiResponse = baseResult;

      const result = await gateway.analyze(mockConfig, mockPayload);

      assert.equal(result.urgency, DependencyUrgency.Recommended);
      assert.equal(result.summary, baseResult.summary);
      assert.deepEqual(result.breakingChanges, baseResult.breakingChanges);
      assert.deepEqual(result.nextSteps, baseResult.nextSteps);
    });

    it('should handle security vulnerabilities as critical urgency', async () => {
      mockAiResponse = {
        urgency: 'critical',
        summary: 'Critical security vulnerability CVE-2023-12345 requires immediate update',
        breakingChanges: [],
        nextSteps: ['Update immediately'],
      };

      const result = await gateway.analyze(mockConfig, {
        ...mockPayload,
        changelog: 'Critical security fix: CVE-2023-12345 - Remote code execution vulnerability',
      });

      assert.equal(result.urgency, DependencyUrgency.Critical);
      assert.match(result.summary, /security|vulnerability|cve/i);
    });

    it('should handle breaking changes as recommended urgency', async () => {
      mockAiResponse = {
        urgency: 'recommended',
        summary: 'Removed deprecated middleware API',
        breakingChanges: ['Removed deprecated middleware API'],
        nextSteps: ['Migrate middleware'],
      };

      const result = await gateway.analyze(mockConfig, {
        ...mockPayload,
        changelog: 'Breaking change: Removed deprecated middleware API.',
      });

      assert.equal(result.urgency, DependencyUrgency.Recommended);
      assert.ok(result.breakingChanges.length > 0);
    });

    it('should handle minor updates as optional urgency', async () => {
      mockAiResponse = {
        urgency: 'optional',
        summary: 'Minor documentation and utility updates in express 4.19.0',
        breakingChanges: [],
        nextSteps: ['Update when convenient'],
      };

      const result = await gateway.analyze(mockConfig, {
        ...mockPayload,
        changelog: 'Minor update: Added new utility functions.',
      });

      assert.equal(result.urgency, DependencyUrgency.Optional);
    });

    it('should extract breaking changes from changelog', async () => {
      mockAiResponse = {
        urgency: 'recommended',
        summary: 'Multiple breaking changes',
        breakingChanges: ['Removed deprecated API', 'Changed default parameter behavior'],
        nextSteps: ['Review migrations'],
      };

      const result = await gateway.analyze(mockConfig, mockPayload);

      assert.ok(Array.isArray(result.breakingChanges));
      assert.equal(result.breakingChanges.length, 2);
    });

    it('should provide actionable next steps', async () => {
      mockAiResponse = baseResult;

      const result = await gateway.analyze(mockConfig, mockPayload);

      assert.ok(Array.isArray(result.nextSteps));
      assert.ok(result.nextSteps.length > 0);
    });

    it('should handle empty changelog gracefully', async () => {
      mockAiResponse = {
        urgency: 'optional',
        summary: 'express 4.19.0 is available with no changelog details',
        breakingChanges: [],
        nextSteps: [],
      };

      const result = await gateway.analyze(mockConfig, {
        ...mockPayload,
        changelog: '',
      });

      assert.ok(result.summary);
      assert.equal(result.urgency, DependencyUrgency.Optional);
    });

    it('should handle missing changelog gracefully', async () => {
      mockAiResponse = {
        urgency: 'optional',
        summary: 'express 4.19.0 is available',
        breakingChanges: [],
        nextSteps: [],
      };

      const result = await gateway.analyze(mockConfig, {
        ...mockPayload,
        changelog: undefined,
      });

      assert.ok(result.summary);
    });

    it('should handle different ecosystems correctly', async () => {
      mockAiResponse = {
        urgency: 'recommended',
        summary: 'requests 4.19.0 includes pip ecosystem updates',
        breakingChanges: [],
        nextSteps: [],
      };

      const result = await gateway.analyze(mockConfig, {
        ...mockPayload,
        ecosystem: 'pip',
        packageName: 'requests',
      });

      assert.ok(result.summary);
      assert.equal(result.urgency, DependencyUrgency.Recommended);
    });

    it('should include package information in summary', async () => {
      mockAiResponse = {
        urgency: 'optional',
        summary: 'express update from 4.18.0 to 4.19.0',
        breakingChanges: [],
        nextSteps: [],
      };

      const result = await gateway.analyze(mockConfig, mockPayload);

      assert.match(result.summary, /express/i);
    });

    it('should include version information in summary', async () => {
      mockAiResponse = {
        urgency: 'optional',
        summary: 'express 4.18.0 to 4.19.0',
        breakingChanges: [],
        nextSteps: [],
      };

      const result = await gateway.analyze(mockConfig, mockPayload);

      assert.match(result.summary, /4\.18|4\.19/i);
    });
  });
});
