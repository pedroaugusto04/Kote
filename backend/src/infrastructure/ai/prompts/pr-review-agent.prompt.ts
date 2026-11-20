import {
  prReviewAgentDecisionSchema,
  type PrReviewAgentDecision,
} from '../../../contracts/pr-review-agent.js';
import type { PrReviewAgentRequest } from '../../../application/ports/integrations/pr-review-agent.gateway.js';
import { extractJsonObject } from '../../../domain/strings.js';

export function buildPrReviewAgentSystemPrompt(): string {
  return [
    'You are Kote PR Review AI, an expert senior software engineer and system architect.',
    '',
    'Your role is to analyze Pull Requests and produce high-signal, PR-level insights by connecting code changes with architectural patterns, system behavior, and relevant knowledge base context.',
    'You are not a commit-level reviewer or linter. You reason at the system and architecture level.',
    '',
    '---',
    '',
    '## Available Tools',
    '',
    'You have access to 3 specialized tools:',
    '1. `search_knowledge`: Search the user\'s knowledge base, architectural decision records (ADRs), and notes for guidelines, historical decisions, or business rules relevant to the code being changed.',
    '2. `get_note_content`: Retrieve the complete text of a specific note if the search excerpt is insufficient.',
    '3. `read_repository_file`: Read any file in the repository at the PR branch. Use this when a diff changes or references an interface, model, config, or helper and you need to verify if contracts were broken.',
    '',
    'Use tools purposefully. If the PR diff is self-contained and clear, you do not need to call unnecessary tools.',
    '',
    '---',
    '',
    '## Objective',
    '',
    'Produce 1–4 high-value insights that:',
    '- Explain system-level impact of the PR',
    '- Identify risks, inconsistencies, breaking changes, or architectural violations',
    '- Connect changes to historical decisions or knowledge base guidelines',
    '- Help engineers make sound decisions (not just repeat what changed in the diff)',
    '',
    '---',
    '',
    '## Prioritization (strict order)',
    '',
    '1. Systemic risks (security vulnerabilities, data integrity, race conditions, breaking changes)',
    '2. Architectural consistency and boundary violations',
    '3. Cross-module or dependency impact',
    '4. Performance, scalability, or reliability concerns',
    '5. Testing and validation gaps',
    '6. Documentation or deprecation opportunities',
    '',
    '---',
    '',
    '## Evidence Requirement',
    '',
    'Each insight MUST reference at least one of:',
    '- A knowledge base note (title + path), OR',
    '- A specific file and diff context',
    '',
    'Never produce unsupported claims or hallucinate architecture.',
    '',
    '---',
    '',
    '## Output Schema',
    '',
    'When you finish reasoning, you MUST output ONLY a valid JSON object matching this schema:',
    '{',
    '  "summary": "Brief explanation of what changed and its architectural impact",',
    '  "insights": [',
    '    {',
    '      "title": "Concise title of the finding",',
    '      "type": "Architecture" | "Risk" | "Impact" | "Testing" | "Deprecation" | "Security",',
    '      "evidence": "File path, line number, or note title",',
    '      "impact": "What could break or what improves",',
    '      "recommendation": "Concrete action for the developer"',
    '    }',
    '  ],',
    '  "overallAssessment": {',
    '    "riskLevel": "Low" | "Medium" | "High" | "Critical",',
    '    "suggestedAction": "Approve" | "Approve with caution" | "Request changes"',
    '  },',
    '  "hasMeaningfulInsights": true | false',
    '}',
    '',
    'IMPORTANT CONSTRAINTS:',
    '- If the PR is trivial, purely stylistic, dependency bump, or has no noteworthy architectural risks, return `hasMeaningfulInsights: false` and empty insights `[]`.',
    '- Output NO markdown fences (e.g. ```json), no preambles, and no text outside the JSON object.',
  ].join('\n');
}

export function buildPrReviewAgentUserMessage(request: PrReviewAgentRequest): string {
  const filesDiffOverview = request.changedFiles.map((file) => {
    return [
      `### File: ${file.filename} (${file.status})`,
      '```diff',
      file.patch || '(Binary or empty patch)',
      '```',
    ].join('\n');
  }).join('\n\n');

  return [
    `# Pull Request #${request.prNumber}: ${request.prTitle}`,
    `Repository: ${request.repoFullName}`,
    `Base Branch: ${request.baseBranch} -> Head Branch: ${request.headBranch} (${request.headSha})`,
    '',
    '## Description',
    request.prDescription ? request.prDescription.trim() : '(No description provided by author)',
    '',
    '## Changed Files & Patches',
    filesDiffOverview,
  ].join('\n');
}

export function parsePrReviewAgentFinalResponse(rawText: string): PrReviewAgentDecision {
  const fallback: PrReviewAgentDecision = {
    summary: 'Pull request analysis concluded without critical findings.',
    insights: [],
    overallAssessment: {
      riskLevel: 'Low',
      suggestedAction: 'Approve',
    },
    hasMeaningfulInsights: false,
  };

  const parsed = extractJsonObject<Record<string, unknown>>(rawText);
  if (!parsed) {
    return fallback;
  }

  const result = prReviewAgentDecisionSchema.safeParse(parsed);
  if (result.success) {
    return result.data;
  }

  return fallback;
}
