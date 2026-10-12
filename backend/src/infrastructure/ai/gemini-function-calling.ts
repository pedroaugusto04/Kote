import { AiProvider, ConversationConfidence } from '../../contracts/enums.js';
import { stripMarkdownFences } from '../../domain/strings.js';
import { truncateForLog } from '../utils/logging.js';
import type { AgentTool } from '../../contracts/agent-tool.js';
import type { AnswerGenerationResponse } from '../../application/ports/query/answer-generation.gateway.js';

import { fetchWithAiRetry, type AiRetryOptions } from './ai-retry.js';

export type GeminiAgentConfig = {
  baseUrl: string;
  model: string;
  apiKey: string;
  maxTurns?: number;
  retryOptions?: AiRetryOptions;
};

import {
  buildGeminiFunctionDeclarations,
  GeminiAgentExecutionError,
} from './mappers/gemini-agent.mapper.js';
import { parseAskAgentFinalResponse } from './prompts/ask-agent.prompt.js';
import type { AskConversationTurn } from '../../contracts/ask-conversation.js';

export { GeminiAgentExecutionError };

export async function runGeminiLoop<T>(
  config: GeminiAgentConfig,
  systemPrompt: string,
  userMessage: string,
  tools: AgentTool[],
  parser: (rawText: string) => T,
  fallback: () => T,
  history?: AskConversationTurn[],
): Promise<T> {
  const maxTurns = config.maxTurns ?? 5;
  const baseUrl = config.baseUrl.replace(/\/$/, '');
  const endpoint = `${baseUrl}/models/${config.model}:generateContent?key=${config.apiKey}`;

  const toolMap = new Map<string, AgentTool>(tools.map((t) => [t.name, t]));
  const functionDeclarations = buildGeminiFunctionDeclarations(tools);

  const contents: Array<{
    role: 'user' | 'model';
    parts: Array<Record<string, unknown>>;
  }> = [];

  if (history && history.length > 0) {
    for (const turn of history) {
      if (turn.question) {
        contents.push({
          role: 'user',
          parts: [{ text: turn.question }],
        });
      }
      if (turn.answer) {
        contents.push({
          role: 'model',
          parts: [{ text: turn.answer }],
        });
      }
    }
  }

  contents.push({
    role: 'user',
    parts: [{ text: userMessage }],
  });

  for (let turn = 0; turn < maxTurns; turn++) {
    const isLastTurn = turn === maxTurns - 1;
    const requestBody: Record<string, unknown> = {
      systemInstruction: {
        parts: [
          {
            text: isLastTurn
              ? `${systemPrompt}\n\nIMPORTANT: This is your final reasoning step. Synthesize your final answer now and output ONLY the JSON object matching the schema, with no preamble or text outside the JSON.`
              : systemPrompt,
          },
        ],
      },
      contents,
      tools: isLastTurn || functionDeclarations.length === 0 ? undefined : [{ functionDeclarations }],
      generationConfig: {
        temperature: 0.2,
      },
    };

    let response: Response;
    try {
      response = await fetchWithAiRetry(
        () =>
          fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(45_000),
          }),
        config.retryOptions,
      );
    } catch (error) {
      throw new GeminiAgentExecutionError('gemini_agent_request_failed', {
        model: config.model,
        endpoint: endpoint.replace(/key=[^&]+/, 'key=***'),
        cause: error,
      });
    }

    const responseText = await response.text();
    if (!response.ok) {
      throw new GeminiAgentExecutionError('gemini_agent_request_rejected', {
        model: config.model,
        endpoint: endpoint.replace(/key=[^&]+/, 'key=***'),
        status: response.status,
        responseBody: truncateForLog(responseText),
      });
    }

    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (error) {
      throw new GeminiAgentExecutionError('gemini_agent_invalid_json', {
        model: config.model,
        endpoint: endpoint.replace(/key=[^&]+/, 'key=***'),
        status: response.status,
        responseBody: truncateForLog(responseText),
        cause: error,
      });
    }

    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    // Check if the model called one or more functions (parallel tool calling supported)
    const functionCallParts = parts.filter((p: any) => p.functionCall != null);

    if (functionCallParts.length > 0) {
      const responseParts: Array<Record<string, unknown>> = [];

      for (const part of functionCallParts) {
        const call = part.functionCall;
        const tool = toolMap.get(call.name);

        let toolOutput: unknown;
        if (tool) {
          try {
            toolOutput = await tool.execute(call.args || {});
          } catch (err: any) {
            toolOutput = { error: err.message || 'Tool execution error' };
          }
        } else {
          toolOutput = { error: `Tool not found: ${call.name}` };
        }

        responseParts.push({
          functionResponse: {
            name: call.name,
            response: { output: toolOutput },
          },
        });
      }

      // Append model turn with exact parts
      contents.push({
        role: 'model',
        parts,
      });

      // Append user turn with all matching function responses
      contents.push({
        role: 'user',
        parts: responseParts,
      });
      continue;
    }

    // Model did not call a function; it provided text
    const textPart = parts.find((p: any) => typeof p.text === 'string');
    const finalText = textPart?.text || '';
    return parser(finalText);
  }

  return fallback();
}

export async function runGeminiAgentLoop(
  config: GeminiAgentConfig,
  systemPrompt: string,
  userQuestion: string,
  tools: AgentTool[],
  history?: AskConversationTurn[],
): Promise<AnswerGenerationResponse> {
  return runGeminiLoop(
    config,
    systemPrompt,
    userQuestion,
    tools,
    parseAskAgentFinalResponse,
    () => ({
      answer: 'I gathered relevant information from your notes, but exceeded maximum reasoning steps.',
      confidence: ConversationConfidence.Low,
      requestedAttachments: false,
      sources: [],
    }),
    history,
  );
}
