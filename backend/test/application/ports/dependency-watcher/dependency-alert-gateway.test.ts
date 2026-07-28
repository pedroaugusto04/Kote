import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DefaultDependencyAlertGateway } from '../../../../src/infrastructure/ai/dependency-alert.gateway.js';
import { DependencyAlertConfig, type DependencyAlertPayload, type DependencyAlertResult } from '../../../../src/application/ports/dependency-watcher/dependency-alert.port.js';
import { AiProvider } from '../../../../src/domain/enums/ai.enums.js';
import { DependencyUrgency } from '../../../../src/domain/enums/dependency.enums.js';
import { generateDependencyAlert } from '../../../../src/adapters/ai.js';

vi.mock('../../../../src/adapters/ai.js', () => ({
  generateDependencyAlert: vi.fn(),
}));

describe('Backend: Dependency Alert Gateway', () => {
  let gateway: DefaultDependencyAlertGateway;

  beforeEach(() => {
    gateway = new DefaultDependencyAlertGateway();
    vi.mocked(generateDependencyAlert).mockReset();
  });

  describe('Business Rules', () => {
    const mockConfig: DependencyAlertConfig = {
      provider: AiProvider.OpenAi,
      baseUrl: 'https://api.openai.com',
      model: 'gpt-4',
      apiKey: 'sk-test-key',
    };

    const mockPayload: DependencyAlertPayload = {
      packageName: 'express',
      currentVersion: '4.18.0',
      latestVersion: '4.19.0',
      changelog: 'Fixed security vulnerability in middleware parsing',
      ecosystem: 'npm',
    };

    const baseResult: DependencyAlertResult = {
      urgency: DependencyUrgency.Recommended,
      summary: 'express 4.18.0 to 4.19.0 includes middleware parsing fixes',
      breakingChanges: ['Removed deprecated middleware'],
      nextSteps: ['Update to latest version', 'Test middleware compatibility'],
    };

    it('should analyze changelog and return urgency assessment', async () => {
      vi.mocked(generateDependencyAlert).mockResolvedValue(baseResult);

      const result = await gateway.analyze(mockConfig, mockPayload);

      expect(generateDependencyAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: mockConfig.provider,
          model: mockConfig.model,
          apiKey: mockConfig.apiKey,
        }),
        mockPayload,
      );
      expect(result).toEqual(baseResult);
    });

    it('should handle security vulnerabilities as critical urgency', async () => {
      const securityPayload: DependencyAlertPayload = {
        ...mockPayload,
        changelog: 'Critical security fix: CVE-2023-12345 - Remote code execution vulnerability',
      };
      vi.mocked(generateDependencyAlert).mockResolvedValue({
        ...baseResult,
        urgency: DependencyUrgency.Critical,
        summary: 'Critical security vulnerability CVE-2023-12345 requires immediate update',
      });

      const result = await gateway.analyze(mockConfig, securityPayload);

      expect(result.urgency).toBe(DependencyUrgency.Critical);
      expect(result.summary).toMatch(/security|vulnerability|cve/i);
    });

    it('should handle breaking changes as recommended urgency', async () => {
      const breakingChangePayload: DependencyAlertPayload = {
        ...mockPayload,
        changelog: 'Breaking change: Removed deprecated middleware API. Users must migrate to new API.',
      };
      vi.mocked(generateDependencyAlert).mockResolvedValue({
        ...baseResult,
        urgency: DependencyUrgency.Recommended,
        breakingChanges: ['Removed deprecated middleware API'],
      });

      const result = await gateway.analyze(mockConfig, breakingChangePayload);

      expect(result.urgency).toBe(DependencyUrgency.Recommended);
      expect(result.breakingChanges.length).toBeGreaterThan(0);
    });

    it('should handle minor updates as optional urgency', async () => {
      const minorUpdatePayload: DependencyAlertPayload = {
        ...mockPayload,
        changelog: 'Minor update: Added new utility functions and improved documentation.',
      };
      vi.mocked(generateDependencyAlert).mockResolvedValue({
        ...baseResult,
        urgency: DependencyUrgency.Optional,
        summary: 'Minor documentation and utility updates in express 4.19.0',
        breakingChanges: [],
      });

      const result = await gateway.analyze(mockConfig, minorUpdatePayload);

      expect(result.urgency).toBe(DependencyUrgency.Optional);
    });

    it('should extract breaking changes from changelog', async () => {
      const breakingChangePayload: DependencyAlertPayload = {
        ...mockPayload,
        changelog: 'Breaking: Removed deprecated API. Breaking: Changed default parameter behavior.',
      };
      vi.mocked(generateDependencyAlert).mockResolvedValue({
        ...baseResult,
        breakingChanges: ['Removed deprecated API', 'Changed default parameter behavior'],
      });

      const result = await gateway.analyze(mockConfig, breakingChangePayload);

      expect(result.breakingChanges).toBeInstanceOf(Array);
      expect(result.breakingChanges.length).toBeGreaterThan(0);
    });

    it('should provide actionable next steps', async () => {
      vi.mocked(generateDependencyAlert).mockResolvedValue(baseResult);

      const result = await gateway.analyze(mockConfig, mockPayload);

      expect(result.nextSteps).toBeInstanceOf(Array);
      expect(result.nextSteps.length).toBeGreaterThan(0);
    });

    it('should handle empty changelog gracefully', async () => {
      const emptyPayload: DependencyAlertPayload = {
        ...mockPayload,
        changelog: '',
      };
      vi.mocked(generateDependencyAlert).mockResolvedValue({
        ...baseResult,
        urgency: DependencyUrgency.Optional,
        summary: 'express 4.19.0 is available with no changelog details',
      });

      const result = await gateway.analyze(mockConfig, emptyPayload);

      expect(result.summary).toBeTruthy();
      expect(result.urgency).toBe(DependencyUrgency.Optional);
    });

    it('should handle missing changelog gracefully', async () => {
      const noChangelogPayload: DependencyAlertPayload = {
        ...mockPayload,
        changelog: undefined,
      };
      vi.mocked(generateDependencyAlert).mockResolvedValue({
        ...baseResult,
        summary: 'express 4.19.0 is available',
      });

      const result = await gateway.analyze(mockConfig, noChangelogPayload);

      expect(result.summary).toBeTruthy();
    });

    it('should handle different ecosystems correctly', async () => {
      const pythonPayload: DependencyAlertPayload = {
        ...mockPayload,
        ecosystem: 'pip',
        packageName: 'requests',
      };
      vi.mocked(generateDependencyAlert).mockResolvedValue({
        ...baseResult,
        summary: 'requests 4.19.0 includes pip ecosystem updates',
      });

      const result = await gateway.analyze(mockConfig, pythonPayload);

      expect(generateDependencyAlert).toHaveBeenCalledWith(expect.any(Object), pythonPayload);
      expect(result.summary).toBeTruthy();
      expect(result.urgency).toBeTruthy();
    });

    it('should include package information in summary', async () => {
      vi.mocked(generateDependencyAlert).mockResolvedValue({
        ...baseResult,
        summary: 'express update from 4.18.0 to 4.19.0',
      });

      const result = await gateway.analyze(mockConfig, mockPayload);

      expect(result.summary).toMatch(/express/i);
    });

    it('should include version information in summary', async () => {
      vi.mocked(generateDependencyAlert).mockResolvedValue({
        ...baseResult,
        summary: 'express 4.18.0 to 4.19.0',
      });

      const result = await gateway.analyze(mockConfig, mockPayload);

      expect(result.summary).toMatch(/4\.18|4\.19/i);
    });
  });
});
