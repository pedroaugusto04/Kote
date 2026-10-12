import { AiProvider, ConversationConfidence } from '../../contracts/enums.js';
import { stripMarkdownFences } from '../../domain/strings.js';
import { truncateForLog } from '../utils/logging.js';
import type { AgentTool } from '../../contracts/agent-tool.js';
import type { AnswerGenerationResponse } from '../../application/ports/query/answer-generation.gateway.js';

import { fetchWithAiRetry, type AiRetryOptions } from './ai-retry.js';

export type OpenAiAgentConfig = {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
  maxTurns?: number;
  retryOptions?: AiRetryOptions;
};

import {
  buildOpenAiTools,
  OpenAiAgentExecutionError,
} from './mappers/openai-agent.mapper.js';
import { parseAskAgentFinalResponse } from './prompts/ask-agent.prompt.js';
import type { AskConversationTurn } from '../../contracts/ask-conversation.js';

export { OpenAiAgentExecutionError };

export async function runOpenAiLoop<T>(
  config: OpenAiAgentConfig,
  systemPrompt: string,
  userMessage: string,
  tools: AgentTool[],
  parser: (rawText: string) => T,
  fallback: () => T,
  history?: AskConversationTurn[],
): Promise<T> {
  const maxTurns = config.maxTurns ?? 5;
  const baseUrl = config.baseUrl.replace(/\/$/, '');
  const endpoint = `${baseUrl}/chat/completions`;

  const toolMap = new Map<string, AgentTool>(tools.map((t) => [t.name, t]));
  const openAiTools = buildOpenAiTools(tools);

  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: systemPrompt },
  ];

  if (history && history.length > 0) {
    for (const turn of history) {
      if (turn.question) {
        messages.push({ role: 'user', content: turn.question });
      }
      if (turn.answer) {
        messages.push({ role: 'assistant', content: turn.answer });
      }
    }
  }

  messages.push({ role: 'user', content: userMessage });

  for (let turn = 0; turn < maxTurns; turn++) {
    const isLastTurn = turn === maxTurns - 1;
    const requestBody: Record<string, unknown> = {
      model: config.model,
      temperature: 0.2,
      messages: isLastTurn
        ? [
            ...messages,
            {
              role: 'system',
              content:
                'This is your final reasoning turn. Please synthesize your final answer now and output ONLY the JSON object matching the schema, with no preamble or text outside the JSON.',
            },
          ]
        : messages,
      tools: isLastTurn || openAiTools.length === 0 ? undefined : openAiTools,
    };

    let response: Response;
    try {
      response = await fetchWithAiRetry(
        () =>
          fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(45_000),
          }),
        config.retryOptions,
      );
    } catch (error) {
      throw new OpenAiAgentExecutionError('openai_agent_request_failed', {
        provider: config.provider,
        model: config.model,
        endpoint,
        cause: error,
      });
    }

    const responseText = await response.text();
    if (!response.ok) {
      throw new OpenAiAgentExecutionError('openai_agent_request_rejected', {
        provider: config.provider,
        model: config.model,
        endpoint,
        status: response.status,
        responseBody: truncateForLog(responseText),
      });
    }

    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (error) {
      throw new OpenAiAgentExecutionError('openai_agent_invalid_json', {
        provider: config.provider,
        model: config.model,
        endpoint,
        status: response.status,
        responseBody: truncateForLog(responseText),
        cause: error,
      });
    }

    const choice = data.choices?.[0];
    const message = choice?.message;

    if (message?.tool_calls && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      // Append assistant message with tool calls
      messages.push(message);

      for (const toolCall of message.tool_calls) {
        const tool = toolMap.get(toolCall.function?.name);
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(toolCall.function?.arguments || '{}');
        } catch {
          parsedArgs = {};
        }

        let toolOutput: unknown;
        if (tool) {
          try {
            toolOutput = await tool.execute(parsedArgs);
          } catch (err: any) {
            toolOutput = { error: err.message || 'Tool execution error' };
          }
        } else {
          toolOutput = { error: `Tool not found: ${toolCall.function?.name}` };
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolOutput),
        });
      }
      continue;
    }

    // Model returned final content
    const rawContent = message?.content || '';
    return parser(rawContent);
  }

  return fallback();
}

export async function runOpenAiAgentLoop(
  config: OpenAiAgentConfig,
  systemPrompt: string,
  userQuestion: string,
  tools: AgentTool[],
  history?: AskConversationTurn[],
): Promise<AnswerGenerationResponse> {
  return runOpenAiLoop(
    config,
    systemPrompt,
    userQuestion,
    tools,
    parseAskAgentFinalResponse,
    () => ({
      answer: 'I gathered relevant information from your notes, but reached the maximum reasoning steps.',
      confidence: ConversationConfidence.Low,
      requestedAttachments: false,
      sources: [],
    }),
    history,
  );
}
