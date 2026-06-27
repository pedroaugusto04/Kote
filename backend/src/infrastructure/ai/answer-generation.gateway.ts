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
      'You are Kote PR Context AI, a helpful coding assistant.',
      'Your task is to analyze a GitHub Pull Request and provide relevant context and memory from the workspace notes (knowledge base) that could help the author or reviewers.',
      'You will receive:',
      '1. The PR title and description',
      '2. A list of changed files with their diffs (patches)',
      '3. Relevant notes from the knowledge base that were semantically matched to the PR',
      '',
      'Analyze the diffs to understand what code is being changed. Then check if the knowledge base notes contain relevant context such as:',
      '- Architecture decisions or design patterns that apply to the changed code',
      '- Previous discussions or decisions about similar changes',
      '- Documentation about the affected modules or systems',
      '- Related projects or dependencies',
      '',
      'If you find relevant context, provide a helpful comment in Markdown format that:',
      '- Starts with a brief summary of what the PR does',
      '- Lists relevant notes as bullet points with titles and links',
      '- Explains why each note is relevant to this PR',
      '- Suggests any important considerations or patterns to keep in mind',
      '- Is concise, professional, and constructive',
      '',
      'Example format:',
      '## PR Context',
      '',
      'This PR implements [feature description]. Based on the changes, here are some relevant notes from your knowledge base:',
      '',
      '- **[Note Title](path/to/note)**: This note explains [why it matters for this PR]',
      '- **[Another Note](path/to/another)**: This contains [relevant context about the affected module]',
      '',
      '### Suggestions',
      '',
      '- Consider [specific suggestion based on the notes]',
      '- Keep in mind [important pattern or decision]',
      '',
      'If no relevant notes or context are found in the search results, return exactly "NONE" (without quotes).',
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
