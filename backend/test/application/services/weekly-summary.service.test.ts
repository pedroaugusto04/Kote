import { describe, it, expect, vi, beforeEach } from 'vitest';
import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

import { WeeklySummaryService } from '../../../../src/application/services/content/weekly-summary.service.js';
import { WeeklySummaryEmailMapper } from '../../../../src/application/mappers/weekly-summary-email.mapper.js';
import { WeeklySummaryRepository, type WeeklySummaryCriticalDependency } from '../../../../src/application/ports/weekly-summary/weekly-summary.repository.js';
import { EmailService } from '../../../../src/application/services/email/email.service.js';
import { UserRepository } from '../../../../src/application/ports/auth/auth.repository.js';
import { CredentialRepository } from '../../../../src/application/ports/integrations/integrations.repository.js';
import { WeeklySummaryGateway } from '../../../../src/application/ports/weekly-summary/weekly-summary.port.js';
import { WeeklySummaryQueuePublisher } from '../../../../src/application/ports/weekly-summary/weekly-summary-queue.publisher.js';
import { RuntimeEnvironmentProvider, type RuntimeEnvironment } from '../../../../src/application/ports/observability/runtime-environment.port.js';
import { AppLogger } from '../../../../src/observability/logger.js';
import { AiProvider, IntegrationProvider } from '../../../../src/contracts/enums.js';
import type { WeeklySummaryAnalysis } from '../../../../src/contracts/weekly-summary.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('WeeklySummaryService & Mapper & Templates', () => {
  let service: WeeklySummaryService;
  let mockWeeklySummaryRepo: WeeklySummaryRepository;
  let mockEmailService: EmailService;
  let mockUsers: UserRepository;
  let mockLogger: AppLogger;
  let mockEnvironmentProvider: RuntimeEnvironmentProvider;
  let mockWeeklySummaryGateway: WeeklySummaryGateway;
  let mockWeeklySummaryQueuePublisher: WeeklySummaryQueuePublisher;
  let mockCredentialRepository: CredentialRepository;

  const mockAnalysis: WeeklySummaryAnalysis = {
    overview: 'Great progress this week across all projects.',
    keyHighlights: ['Shipped new authentication flow', 'Resolved performance bottleneck in notes search'],
    byProject: [
      {
        projectName: 'core-platform',
        summary: 'Focused on core architecture improvements.',
        noteCount: 5,
        notableNotes: [
          { title: 'Refactor DB queries', summary: 'Improved response times by 40%' },
        ],
      },
    ],
    recommendations: ['Review open pull requests', 'Update outdated dependencies'],
  };

  const mockCriticalDependencies: WeeklySummaryCriticalDependency[] = [
    {
      packageName: 'express',
      currentVersion: '4.17.1',
      latestVersion: '4.18.2',
      ecosystem: 'npm',
      workspaceSlug: 'my-workspace',
      projectName: 'API Server',
    },
    {
      packageName: 'jsonwebtoken',
      currentVersion: '8.5.1',
      latestVersion: '9.0.0',
      ecosystem: 'npm',
      workspaceSlug: 'my-workspace',
      projectName: null,
    },
  ];

  beforeEach(() => {
    mockWeeklySummaryRepo = {
      listUserNoteCountsForRange: vi.fn(),
      listUsersByIds: vi.fn(),
      getCriticalDependencyUpdates: vi.fn().mockResolvedValue(mockCriticalDependencies),
      listUserWorkspaceSlugs: vi.fn().mockResolvedValue(['my-workspace']),
      listNotesForUserRange: vi.fn(),
    } as unknown as WeeklySummaryRepository;

    mockEmailService = {
      sendEmail: vi.fn().mockResolvedValue(undefined),
    } as unknown as EmailService;

    mockUsers = {
      findUserById: vi.fn().mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        displayName: 'Pedro Duarte',
      }),
    } as unknown as UserRepository;

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    } as unknown as AppLogger;

    mockEnvironmentProvider = {
      read: vi.fn().mockReturnValue({
        emailFrom: 'Kote <noreply@kote.app>',
        reviewAiProvider: AiProvider.OpenAi,
        reviewAiBaseUrl: 'https://api.openai.com',
        reviewAiModel: 'gpt-4o',
        reviewAiApiKey: 'sk-key',
      } as RuntimeEnvironment),
    } as unknown as RuntimeEnvironmentProvider;

    mockWeeklySummaryGateway = {
      generate: vi.fn().mockResolvedValue(mockAnalysis),
    } as unknown as WeeklySummaryGateway;

    mockWeeklySummaryQueuePublisher = {
      publishWeeklySummaryJob: vi.fn().mockResolvedValue(undefined),
    } as unknown as WeeklySummaryQueuePublisher;

    mockCredentialRepository = {
      findCredential: vi.fn().mockResolvedValue({
        status: 'connected',
        provider: IntegrationProvider.AiReview,
      }),
    } as unknown as CredentialRepository;

    service = new WeeklySummaryService(
      mockWeeklySummaryRepo,
      mockEmailService,
      mockUsers,
      mockLogger,
      mockEnvironmentProvider,
      mockWeeklySummaryGateway,
      mockWeeklySummaryQueuePublisher,
      mockCredentialRepository,
    );
  });

  describe('WeeklySummaryService.sendWeeklySummaryToUser', () => {
    it('fetches critical dependency updates and sends them via email', async () => {
      const user = { id: 'user-1', email: 'user@example.com', displayName: 'Pedro' };
      const userNotesByProject = {
        'core-platform': [
          {
            id: 'note-1',
            userId: 'user-1',
            title: 'Note Title',
            summary: 'Note summary',
            projectId: 'proj-1',
            createdAt: new Date(),
            projectSlug: 'core-platform',
          },
        ],
      };

      const result = await service.sendWeeklySummaryToUser(user, userNotesByProject);

      expect(result).toEqual({ sent: true, reason: 'sent', totalNotes: 1 });
      expect(mockWeeklySummaryRepo.getCriticalDependencyUpdates).toHaveBeenCalledWith('user-1');
      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          templateName: 'weekly-summary',
          templateData: expect.objectContaining({
            displayName: 'Pedro',
            appName: 'Kote',
            aiSummary: mockAnalysis,
            criticalDependencyUpdates: mockCriticalDependencies,
          }),
        }),
      );
    });
  });

  describe('WeeklySummaryEmailMapper', () => {
    it('formats text content with critical dependency updates when present', () => {
      const text = WeeklySummaryEmailMapper.toTextContent(
        'Pedro',
        'Kote',
        mockAnalysis,
        mockCriticalDependencies,
      );

      expect(text).toContain('Dependency Updates (Critical):');
      expect(text).toContain('- express: 4.17.1 -> 4.18.2 (API Server)');
      expect(text).toContain('- jsonwebtoken: 8.5.1 -> 9.0.0');
      expect(text).toContain('Thanks — sent by Kote');
    });

    it('omits dependency updates section when critical dependencies list is empty or undefined', () => {
      const text = WeeklySummaryEmailMapper.toTextContent('Pedro', 'Kote', mockAnalysis, []);

      expect(text).not.toContain('Dependency Updates');
    });
  });

  describe('Handlebars weekly-summary.hbs template', () => {
    it('renders Dependency Updates (Critical) section when items exist', () => {
      const templatePath = path.resolve(__dirname, '../../../../src/infrastructure/email/templates/weekly-summary.hbs');
      const templateSource = fs.readFileSync(templatePath, 'utf8');
      const template = Handlebars.compile(templateSource);

      const html = template({
        displayName: 'Pedro',
        appName: 'Kote',
        aiSummary: mockAnalysis,
        criticalDependencyUpdates: mockCriticalDependencies,
        frontUrl: 'https://kote.app',
      });

      expect(html).toContain('<h2>Dependency Updates (Critical)</h2>');
      expect(html).toContain('<strong>express</strong>: 4.17.1 &rarr; 4.18.2 (<em>API Server</em>)');
      expect(html).toContain('<strong>jsonwebtoken</strong>: 8.5.1 &rarr; 9.0.0');
    });

    it('does not render Dependency Updates section when criticalDependencyUpdates is empty', () => {
      const templatePath = path.resolve(__dirname, '../../../../src/infrastructure/email/templates/weekly-summary.hbs');
      const templateSource = fs.readFileSync(templatePath, 'utf8');
      const template = Handlebars.compile(templateSource);

      const html = template({
        displayName: 'Pedro',
        appName: 'Kote',
        aiSummary: mockAnalysis,
        criticalDependencyUpdates: [],
        frontUrl: 'https://kote.app',
      });

      expect(html).not.toContain('Dependency Updates');
    });
  });
});
