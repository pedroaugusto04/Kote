import { AiProvider } from '../../../contracts/enums.js';
import type { AgentTool } from '../../../contracts/agent-tool.js';

export class GeminiAgentExecutionError extends Error {
  readonly provider = AiProvider.Gemini;
  readonly model: string;
  readonly endpoint: string;
  readonly status?: number;
  readonly responseBody?: string;

  constructor(
    message: string,
    details: {
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
    this.name = 'GeminiAgentExecutionError';
    this.model = details.model;
    this.endpoint = details.endpoint;
    this.status = details.status;
    this.responseBody = details.responseBody;
  }
}

export function mapJsonSchemaTypeToGemini(type: string): string {
  const normalized = (type || '').toLowerCase();
  switch (normalized) {
    case 'string':
      return 'STRING';
    case 'number':
      return 'NUMBER';
    case 'integer':
      return 'INTEGER';
    case 'boolean':
      return 'BOOLEAN';
    case 'array':
      return 'ARRAY';
    case 'object':
    default:
      return 'OBJECT';
  }
}

export function buildGeminiFunctionDeclarations(tools: AgentTool[]) {
  return tools.map((tool) => {
    const properties: Record<string, { type: string; description: string }> = {};
    for (const [key, param] of Object.entries(tool.parameters.properties || {})) {
      properties[key] = {
        type: mapJsonSchemaTypeToGemini(param.type),
        description: param.description || '',
      };
    }
    return {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'OBJECT',
        properties,
        required: tool.parameters.required || [],
      },
    };
  });
}
