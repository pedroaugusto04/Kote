import { AiProvider } from '../../contracts/enums.js';
import { stripMarkdownFences } from '../../domain/strings.js';
import { truncateForLog } from '../utils/logging.js';

import { fetchWithAiRetry, type AiRetryOptions } from './ai-retry.js';
import { getLangfuse } from './langfuse.js';

export type ChatConfig = {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
  responseFormat?: { type: 'json_object' | 'text' };
  retryOptions?: AiRetryOptions;
};

export class AiChatCompletionError extends Error {
  readonly provider: AiProvider;
  readonly model: string;
  readonly endpoint: string;
  readonly status?: number;
  readonly statusText?: string;
  readonly responseBody?: string;

  constructor(
    message: string,
    details: {
      provider: AiProvider;
      model: string;
      endpoint: string;
      status?: number;
      statusText?: string;
      responseBody?: string;
      cause?: unknown;
    },
  ) {
    const fullMessage = details.responseBody
      ? `${message} (${details.status || 'unknown'}: ${details.responseBody})`
      : message;
    super(fullMessage, { cause: details.cause });
    this.name = 'AiChatCompletionError';
    this.provider = details.provider;
    this.model = details.model;
    this.endpoint = details.endpoint;
    this.status = details.status;
    this.statusText = details.statusText;
    this.responseBody = details.responseBody;
  }
}

export async function runChatCompletion(
  config: ChatConfig,
  systemPrompt: string,
  userContent: string,
): Promise<string> {
  if (config.provider === AiProvider.None || !config.apiKey || !config.model) return '';
  const endpoint = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const startTime = new Date();
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ];
  const requestBody = JSON.stringify({
    model: config.model,
    temperature: 0.1,
    response_format: config.responseFormat || { type: 'json_object' },
    messages,
  });

  const langfuse = getLangfuse();
  const trace = langfuse?.trace({
    name: 'kote:chat-completion',
    metadata: { provider: config.provider, model: config.model },
    input: { systemPrompt, userContent },
  });
  const generation = trace?.generation({
    name: 'chat-completion',
    model: config.model,
    modelParameters: { temperature: 0.1 },
    input: messages,
    startTime,
  });

  let response: Response;
  try {
    response = await fetchWithAiRetry(
      () =>
        fetch(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${config.apiKey}`,
          },
          body: requestBody,
          signal: AbortSignal.timeout(45_000),
        }),
      config.retryOptions,
    );
  } catch (error) {
    generation?.end({
      output: { error: String(error) },
      level: 'ERROR',
      statusMessage: String(error),
    });
    throw new AiChatCompletionError('chat_completion_request_failed', {
      provider: config.provider,
      model: config.model,
      endpoint,
      cause: error,
    });
  }

  const responseText = await response.text();
  if (!response.ok) {
    generation?.end({
      output: responseText,
      level: 'ERROR',
      statusMessage: `${response.status} ${response.statusText}`,
    });
    throw new AiChatCompletionError('chat_completion_request_rejected', {
      provider: config.provider,
      model: config.model,
      endpoint,
      status: response.status,
      statusText: response.statusText,
      responseBody: truncateForLog(responseText),
    });
  }

  let data: {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  try {
    data = JSON.parse(responseText) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
  } catch (error) {
    generation?.end({
      output: responseText,
      level: 'ERROR',
      statusMessage: 'Invalid JSON',
    });
    throw new AiChatCompletionError('chat_completion_invalid_json', {
      provider: config.provider,
      model: config.model,
      endpoint,
      status: response.status,
      statusText: response.statusText,
      responseBody: truncateForLog(responseText),
      cause: error,
    });
  }
  const resultText = stripMarkdownFences(data.choices?.[0]?.message?.content || '');
  generation?.end({
    output: resultText,
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined,
  });
  trace?.update({ output: resultText });
  return resultText;
}

export async function runStructuredChatCompletion<T>(
  config: ChatConfig,
  systemPrompt: string,
  userContent: string,
  parse: (input: unknown) => T,
): Promise<T | null> {
  const content = await runChatCompletion(config, systemPrompt, userContent);
  if (!content) return null;
  return parse(JSON.parse(content));
}
