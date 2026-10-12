import { AiProvider } from '../../../contracts/enums.js';
import type { AgentTool } from '../../../contracts/agent-tool.js';

export class OpenAiAgentExecutionError extends Error {
  readonly provider: AiProvider;
  readonly model: string;
  readonly endpoint: string;
  readonly status?: number;
  readonly responseBody?: string;

  constructor(
    message: string,
    details: {
      provider: AiProvider;
      model: string;
      endpoint: string;
      status?: number;
      responseBody?: string;
      cause?: unknown;
    },
  ) {
    const fullMessage = details.responseBody
      ? `${message} (${details.status || 'unknown'}: ${details.responseBody})`
      : message;
    super(fullMessage, { cause: details.cause });
    this.name = 'OpenAiAgentExecutionError';
    this.provider = details.provider;
    this.model = details.model;
    this.endpoint = details.endpoint;
    this.status = details.status;
    this.responseBody = details.responseBody;
  }
}

export function buildOpenAiTools(tools: AgentTool[]) {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: tool.parameters.properties || {},
        required: tool.parameters.required || [],
      },
    },
  }));
}
