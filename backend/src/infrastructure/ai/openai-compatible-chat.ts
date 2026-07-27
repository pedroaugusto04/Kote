import { AiProvider } from '../../contracts/enums.js';
import { stripMarkdownFences } from '../../domain/strings.js';
import { truncateForLog } from '../utils/logging.js';

export type ChatConfig = {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
  responseFormat?: { type: 'json_object' | 'text' };
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
    super(message, { cause: details.cause });
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
  const requestBody = JSON.stringify({
    model: config.model,
    temperature: 0.1,
    response_format: config.responseFormat || { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
  });

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
      },
      body: requestBody,
    });
  } catch (error) {
    throw new AiChatCompletionError('chat_completion_request_failed', {
      provider: config.provider,
      model: config.model,
      endpoint,
      cause: error,
    });
  }

  const responseText = await response.text();
  if (!response.ok) {
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
  };
  try {
    data = JSON.parse(responseText) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
  } catch (error) {
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
  return stripMarkdownFences(data.choices?.[0]?.message?.content || '');
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
