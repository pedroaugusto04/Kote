import { Injectable } from '@nestjs/common';

import { AiProvider, ConversationConfidence } from '../../contracts/enums.js';
import type { AskConversationTurn } from '../../contracts/ask-conversation.js';
import {
  AnswerGenerationGateway,
  type AnswerGenerationConfig,
  type AnswerGenerationRequest,
  type AnswerGenerationResponse,
  type PrContextAiConfig,
  type AnswerContextChunk,
} from '../../application/ports/query/answer-generation.gateway.js';
import { runChatCompletion } from './openai-compatible-chat.js';
import {
  buildAnswerGenerationPrompt,
  buildAnswerGenerationSystemPrompt,
  parseAnswerGenerationResponse,
} from './prompts/answer-generation.prompt.js';

@Injectable()
export class DefaultAnswerGenerationGateway extends AnswerGenerationGateway {
  async generate(
    config: AnswerGenerationConfig,
    payload: AnswerGenerationRequest,
  ): Promise<AnswerGenerationResponse | null> {
    if (
      config.conversationAiProvider === AiProvider.None ||
      !config.conversationAiApiKey ||
      !config.conversationAiModel
    ) {
      return null;
    }

    const chatConfig = {
      provider: config.conversationAiProvider,
      baseUrl: config.conversationAiBaseUrl,
      model: config.conversationAiModel,
      apiKey: config.conversationAiApiKey,
    };

    const systemPrompt = buildAnswerGenerationSystemPrompt();
    const userContent = buildAnswerGenerationPrompt(payload);

    const content = await runChatCompletion(chatConfig, systemPrompt, userContent);
    if (!content) return null;

    try {
      const parsedJson = JSON.parse(content);
      return parseAnswerGenerationResponse(parsedJson, payload.context);
    } catch {
      // Fallback: If parsing fails, treat the response text as the answer itself
      return {
        answer: content,
        confidence: ConversationConfidence.Medium,
        requestedAttachments: false,
        sources: [],
      };
    }
  }

  async rewriteQuery(
    config: AnswerGenerationConfig,
    question: string,
    history: AskConversationTurn[],
  ): Promise<string> {
    if (
      config.conversationAiProvider === AiProvider.None ||
      !config.conversationAiApiKey ||
      !config.conversationAiModel ||
      history.length === 0
    ) {
      return question;
    }

    const chatConfig = {
      provider: config.conversationAiProvider,
      baseUrl: config.conversationAiBaseUrl,
      model: config.conversationAiModel,
      apiKey: config.conversationAiApiKey,
    };

    const systemPrompt = [
      'You are a search query optimizer.',
      'Given a conversation history and a follow-up question from the user, rewrite the follow-up question to be an independent, self-contained search query.',
      'Ensure the rewritten query is in the same language as the follow-up question, resolves all pronouns (e.g. "it", "he", "they", "the file", "them", "isso", "dele", "aquilo") to their full referenced entities from the history, and retains all relevant keywords.',
      'If the question is already self-contained or the history is empty, return the original question exactly.',
      'Return a JSON object with this shape: {"rewrittenQuery": "..."}'
    ].join('\n');

    const userContent = JSON.stringify({
      history: history.map(h => ({ question: h.question, answer: h.answer })),
      followUpQuestion: question
    });

    try {
      const content = await runChatCompletion(chatConfig, systemPrompt, userContent);
      if (!content) return question;
      const parsed = JSON.parse(content);
      return String(parsed.rewrittenQuery || question).trim();
    } catch {
      return question;
    }
  }

  async generatePullRequestComment(
    config: PrContextAiConfig,
    payload: {
      prTitle: string;
      prDescription: string;
      changedFiles: Array<{ filename: string; status: string; patch: string }>;
      context: AnswerContextChunk[];
    },
  ): Promise<string | null> {
    if (config.provider === 'none' || !config.apiKey || !config.model) {
      return null;
    }

    const systemPrompt = [
      'You are Kote PR Review AI, an expert senior software engineer and system architect.',
      '',
      'Your role is to analyze Pull Requests and produce high-signal, PR-level insights by connecting code changes with architectural patterns, system behavior, and relevant knowledge base context.',
      'You are not a commit-level reviewer. You reason at the system level.',
      '',
      '---',
      '',
      '## Input',
      '',
      'You will receive:',
      '',
      '1. PR title and description',
      '2. Changed files with diffs',
      '3. Relevant knowledge base notes (semantically retrieved)',
      '',
      '---',
      '',
      '## Objective',
      '',
      'Produce 2–5 high-value insights that:',
      '- Explain system-level impact of the PR',
      '- Identify risks, inconsistencies, or architectural concerns',
      '- Connect changes to historical decisions or knowledge base context',
      '- Help engineers make decisions (not just understand changes)',
      '',
      '---',
      '',
      '## Core Principles',
      '',
      '- Focus only on PR-level reasoning (not individual commits)',
      '- Prefer correctness and critical insights over completeness',
      '- Avoid generic feedback',
      '- Do not speculate beyond provided code and notes',
      '- Every insight must be grounded in evidence',
      '- Prefer fewer insights with higher impact over more insights with lower signal',
      '',
      '---',
      '',
      '## Prioritization (strict order)',
      '',
      '1. Systemic risks (security, data integrity, breaking changes)',
      '2. Architectural consistency and violations',
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
      '- A specific file or diff context',
      '',
      'Do not produce unsupported claims.',
      '',
      '---',
      '',
      '## Output',
      '',
      'Return the response in a clear, readable, and well-formatted way so it is easy for humans to understand.',
      'Structure the output in a way that best communicates the insights (you may use headings, lists, bold text, etc.).',
      '',
      'Example format:',
      '',
      '## PR Insights',
      '',
      'This PR [brief summary of what changes and why it matters].',
      '',
      '### Key Insights',
      '',
      '#### [Insight Title]',
      '',
      '**Type:** Architectural | Risk | Impact | Testing | Deprecation',
      '**Evidence:** [file path or KB note]',
      '',
      '[Concise explanation of the issue or observation]',
      '',
      '**Impact:** [what could break / what improves]',
      '**Recommendation:** [clear action for developer]',
      '',
      '---',
      '',
      '### Overall Assessment',
      '',
      '**Risk Level:** Low | Medium | High | Critical',
      '**Suggested Action:** Approve | Approve with caution | Request changes',
      '',
      '---',
      '',
      '## Constraints',
      '- Do not fabricate architecture or decisions not supported by input',
      '- If no meaningful insights exist, return exactly: NONE',
    ].join('\n');

    const userContent = JSON.stringify({
      prTitle: payload.prTitle,
      prDescription: payload.prDescription,
      changedFiles: payload.changedFiles.map(f => ({
        filename: f.filename,
        status: f.status,
        patch: f.patch || '',
      })),
      notesContext: payload.context.map(c => ({
        title: c.title,
        path: c.path,
        content: c.chunkText,
      })),
    });

    try {
      const content = await runChatCompletion(
        {
          provider: config.provider as AiProvider,
          baseUrl: config.baseUrl,
          model: config.model,
          apiKey: config.apiKey,
        },
        systemPrompt,
        userContent,
      );
      return content || null;
    } catch {
      return null;
    }
  }
}
