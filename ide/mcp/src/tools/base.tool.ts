import { ApiClient } from '../client/api-client.js';

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute(args: any, apiClient: ApiClient): Promise<unknown>;
}
