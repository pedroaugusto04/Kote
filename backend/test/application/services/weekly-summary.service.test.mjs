import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Handlebars from 'handlebars';

import { WeeklySummaryService } from '../../../dist/application/services/content/weekly-summary.service.js';
import { WeeklySummaryEmailMapper } from '../../../dist/application/mappers/weekly-summary-email.mapper.js';
import { AiProvider, IntegrationProvider } from '../../../dist/contracts/enums.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('WeeklySummaryService & Mapper & Templates', () => {
  let service;
  let mockWeeklySummaryRepo;
  let mockEmailService;
  let mockUsers;
  let mockLogger;
  let mockEnvironmentProvider;
  let mockWeeklySummaryGateway;
  let mockWeeklySummaryQueuePublisher;
  let mockCredentialRepository;
  let sentEmails;

  const mockAnalysis = {
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

  const mockCriticalDependencies = [
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
    sentEmails = [];

    mockWeeklySummaryRepo = {
      listUserNoteCountsForRange: async () => [],
      listUsersByIds: async () => [],
      getCriticalDependencyUpdates: async () => mockCriticalDependencies,
      listUserWorkspaceSlugs: async () => ['my-workspace'],
      listNotesForUserRange: async () => [],
    };

    mockEmailService = {
      sendEmail: async (payload) => {
        sentEmails.push(payload);
      },
    };

    mockUsers = {
      findUserById: async () => ({
        id: 'user-1',
        email: 'user@example.com',
        displayName: 'Pedro Duarte',
      }),
    };

    mockLogger = {
      info: () => {},
      error: () => {},
      warn: () => {},
    };

    mockEnvironmentProvider = {
      read: () => ({
        emailFrom: 'Kote <noreply@kote.app>',
        reviewAiProvider: AiProvider.OpenAi,
        reviewAiBaseUrl: 'https://api.openai.com',
        reviewAiModel: 'gpt-4o',
        reviewAiApiKey: 'sk-key',
      }),
    };

    mockWeeklySummaryGateway = {
      generate: async () => mockAnalysis,
    };

    mockWeeklySummaryQueuePublisher = {
      publishWeeklySummaryJob: async () => {},
    };

    mockCredentialRepository = {
      findCredential: async () => ({
        status: 'connected',
        provider: IntegrationProvider.AiReview,
      }),
    };

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

      assert.deepEqual(result, { sent: true, reason: 'sent', totalNotes: 1 });
      assert.equal(sentEmails.length, 1);
      assert.equal(sentEmails[0].to, 'user@example.com');
      assert.equal(sentEmails[0].templateName, 'weekly-summary');
      assert.equal(sentEmails[0].templateData.displayName, 'Pedro');
      assert.equal(sentEmails[0].templateData.appName, 'Kote');
      assert.deepEqual(sentEmails[0].templateData.aiSummary, mockAnalysis);
      assert.deepEqual(sentEmails[0].templateData.criticalDependencyUpdates, mockCriticalDependencies);
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

      assert.ok(text.includes('Dependency Updates (Critical):'));
      assert.ok(text.includes('- express: 4.17.1 -> 4.18.2 (API Server)'));
      assert.ok(text.includes('- jsonwebtoken: 8.5.1 -> 9.0.0'));
      assert.ok(text.includes('Thanks — sent by Kote'));
    });

    it('omits dependency updates section when critical dependencies list is empty or undefined', () => {
      const text = WeeklySummaryEmailMapper.toTextContent('Pedro', 'Kote', mockAnalysis, []);

      assert.ok(!text.includes('Dependency Updates'));
    });
  });

  describe('Handlebars weekly-summary.hbs template', () => {
    it('renders Dependency Updates (Critical) section when items exist', () => {
      const templatePath = path.resolve(__dirname, '../../../src/infrastructure/email/templates/weekly-summary.hbs');
      const templateSource = fs.readFileSync(templatePath, 'utf8');
      const template = Handlebars.compile(templateSource);

      const html = template({
        displayName: 'Pedro',
        appName: 'Kote',
        aiSummary: mockAnalysis,
        criticalDependencyUpdates: mockCriticalDependencies,
        frontUrl: 'https://kote.app',
      });

      assert.ok(html.includes('Dependency Updates (Critical)'));
      assert.ok(html.includes('<strong>express</strong>: 4.17.1 &rarr; 4.18.2 (<em>API Server</em>)'));
      assert.ok(html.includes('<strong>jsonwebtoken</strong>: 8.5.1 &rarr; 9.0.0'));
    });

    it('does not render Dependency Updates section when criticalDependencyUpdates is empty', () => {
      const templatePath = path.resolve(__dirname, '../../../src/infrastructure/email/templates/weekly-summary.hbs');
      const templateSource = fs.readFileSync(templatePath, 'utf8');
      const template = Handlebars.compile(templateSource);

      const html = template({
        displayName: 'Pedro',
        appName: 'Kote',
        aiSummary: mockAnalysis,
        criticalDependencyUpdates: [],
        frontUrl: 'https://kote.app',
      });

      assert.ok(!html.includes('Dependency Updates'));
    });
  });
});
