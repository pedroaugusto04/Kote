import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parsePrReviewAgentFinalResponse,
  buildPrReviewAgentSystemPrompt,
  buildPrReviewAgentUserMessage,
} from '../../../dist/infrastructure/ai/prompts/pr-review-agent.prompt.js';
import { formatPrReviewComment } from '../../../dist/application/services/review/pr-review-presenter.js';
import { PrReviewAgentToolsService } from '../../../dist/application/services/review/pr-review-agent-tools.service.js';
import { AgentContextTracker } from '../../../dist/application/services/query/agent-context-tracker.js';

test('pr-review-agent prompt parser handles valid JSON correctly', () => {
  const jsonResponse = JSON.stringify({
    summary: 'Updates auth token handling with refresh rotation.',
    insights: [
      {
        title: 'Token race condition mitigated',
        type: 'Architecture',
        evidence: 'backend/src/auth.ts',
        impact: 'Prevents expired session errors',
        recommendation: 'Ensure Redis lock duration is configured',
      },
    ],
    overallAssessment: {
      riskLevel: 'Low',
      suggestedAction: 'Approve',
    },
    hasMeaningfulInsights: true,
  });

  const parsed = parsePrReviewAgentFinalResponse(jsonResponse);
  assert.equal(parsed.hasMeaningfulInsights, true);
  assert.equal(parsed.insights.length, 1);
  assert.equal(parsed.insights[0].title, 'Token race condition mitigated');
  assert.equal(parsed.overallAssessment.riskLevel, 'Low');
});

test('pr-review-agent prompt parser falls back gracefully on invalid JSON', () => {
  const parsed = parsePrReviewAgentFinalResponse('not a valid json string');
  assert.equal(parsed.hasMeaningfulInsights, false);
  assert.equal(parsed.insights.length, 0);
  assert.equal(parsed.overallAssessment.riskLevel, 'Low');
  assert.equal(parsed.overallAssessment.suggestedAction, 'Approve');
});

test('buildPrReviewAgentSystemPrompt produces system architect prompt', () => {
  const prompt = buildPrReviewAgentSystemPrompt();
  assert.ok(prompt.includes('Kote PR Review AI'));
  assert.ok(prompt.includes('search_knowledge'));
  assert.ok(prompt.includes('get_note_content'));
  assert.ok(prompt.includes('read_repository_file'));
});

test('formatPrReviewComment formats markdown correctly without duplication', () => {
  const decision = {
    summary: 'Refactored billing gateway.',
    insights: [
      {
        title: 'Missing idempotency key',
        type: 'Risk',
        evidence: 'src/billing.ts',
        impact: 'Double charge risk',
        recommendation: 'Pass idempotency key to Stripe client',
      },
    ],
    overallAssessment: {
      riskLevel: 'High',
      suggestedAction: 'Request changes',
    },
    hasMeaningfulInsights: true,
  };

  const sources = [
    {
      noteId: 'note-1',
      title: 'Stripe Integration ADR',
      path: 'docs/stripe-adr.md',
    },
  ];

  const formatted = formatPrReviewComment(decision, 'headsha123', sources);
  assert.ok(formatted.includes('## PR Insights'));
  assert.ok(formatted.includes('Refactored billing gateway.'));
  assert.ok(formatted.includes('### Key Insights'));
  assert.ok(formatted.includes('Missing idempotency key'));
  assert.ok(formatted.includes('`High`'));
  assert.ok(formatted.includes('Stripe Integration ADR'));
});

test('PrReviewAgentToolsService builds 3 tools and executes read_repository_file and notes retrieval', async () => {
  let fileFetched = false;
  const githubGatewayMock = {
    async fetchFileContent(repoFullName, path, token) {
      fileFetched = true;
      assert.equal(repoFullName, 'octocat/hello-world');
      assert.equal(path, 'src/main.ts');
      assert.equal(token, 'gh-token-123');
      return 'export const hello = () => "world";';
    },
  };

  const contentRepoMock = {
    async getNotesByIds(_userId, ids) {
      return [
        {
          id: ids[0],
          title: 'Architecture Guideline',
          path: 'guidelines/arch.md',
          markdown: '# Architecture Guidelines\nAlways use Clean Architecture.',
          summary: 'Clean architecture guideline',
          workspaceId: 'ws-1',
          projectId: 'p-1',
        },
      ];
    },
    async listProjects() {
      return [{ id: 'p-1', projectSlug: 'main-app', workspaceId: 'ws-1' }];
    },
  };

  const ragRetrievalMock = {
    async retrieveHybridChunks() {
      return {
        rankedChunks: [{ noteId: 'note-1', chunkText: 'Clean architecture pattern' }],
        noteMap: new Map([['note-1', { id: 'note-1', title: 'Architecture Guideline', path: 'guidelines/arch.md', workspaceId: 'ws-1', projectId: 'p-1' }]]),
        validSyntheses: [],
      };
    },
  };

  const ragAssemblerMock = {
    async buildAskContextResult() {
      return {
        relatedNotes: [],
        contextChunks: [
          {
            noteId: 'note-1',
            title: 'Architecture Guideline',
            path: 'guidelines/arch.md',
            projectSlug: 'main-app',
            workspaceId: 'ws-1',
            chunkText: 'Clean architecture pattern',
          },
        ],
      };
    },
  };

  const loggerMock = { info() {}, warn() {}, error() {}, debug() {} };

  const toolsService = new PrReviewAgentToolsService(
    ragRetrievalMock,
    ragAssemblerMock,
    contentRepoMock,
    githubGatewayMock,
    loggerMock,
  );

  const tracker = new AgentContextTracker();
  const tools = toolsService.buildTools({
    userId: 'user-1',
    scope: { workspaceId: 'ws-1' },
    embeddingConfig: { provider: 'none', baseUrl: '', model: '', apiKey: '' },
    ragConfig: { candidateLimit: 10, minSimilarity: 0.5, hybridVectorWeight: 0.7, hybridKeywordWeight: 0.3, topChunksLimit: 5, rrfK: 20, recencyBonusEnabled: false, recencyMaxBonus: 0, recencyMaxBonusDays: 180 },
    githubToken: 'gh-token-123',
    repoFullName: 'octocat/hello-world',
    headSha: 'abc1234',
    tracker,
  });

  assert.equal(tools.length, 3);
  const toolNames = tools.map((t) => t.name);
  assert.ok(toolNames.includes('search_knowledge'));
  assert.ok(toolNames.includes('get_note_content'));
  assert.ok(toolNames.includes('read_repository_file'));

  // Execute read_repository_file
  const readFileTool = tools.find((t) => t.name === 'read_repository_file');
  const fileResult = await readFileTool.execute({ path: 'src/main.ts' });
  assert.equal(fileFetched, true);
  assert.equal(fileResult.content, 'export const hello = () => "world";');

  // Execute search_knowledge
  const searchTool = tools.find((t) => t.name === 'search_knowledge');
  const searchResult = await searchTool.execute({ query: 'clean architecture' });
  assert.equal(searchResult.resultsCount, 1);
  assert.equal(tracker.getSources().length, 1);
  assert.equal(tracker.getSources()[0].title, 'Architecture Guideline');

  // Execute get_note_content
  const getNoteTool = tools.find((t) => t.name === 'get_note_content');
  const noteResult = await getNoteTool.execute({ noteId: 'note-1' });
  assert.equal(noteResult.title, 'Architecture Guideline');
  assert.ok(noteResult.content.includes('Always use Clean Architecture.'));
});
