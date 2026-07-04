import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { loadCliConfig } from './config/env.config.js';
import { ApiClient } from './client/api-client.js';
import { StderrLogger } from './logger/stderr.logger.js';
import { McpTool } from './tools/base.tool.js';
import { SearchNotesTool } from './tools/search-notes.tool.js';
import { GetNoteTool } from './tools/get-note.tool.js';
import { CreateNoteTool } from './tools/create-note.tool.js';

export class KoteMcpServer {
  private readonly server: Server;
  private readonly apiClient: ApiClient;
  private readonly tools = new Map<string, McpTool>();

  constructor() {
    this.server = new Server(
      {
        name: 'kote-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Load credentials and create the HTTP API client
    const config = loadCliConfig();
    this.apiClient = new ApiClient(config);

    // Register tools
    this.registerTool(new SearchNotesTool());
    this.registerTool(new GetNoteTool());
    this.registerTool(new CreateNoteTool());

    // Setup request handlers
    this.setupHandlers();
  }

  private registerTool(tool: McpTool): void {
    this.tools.set(tool.name, tool);
    StderrLogger.debug(`Registered tool: ${tool.name}`);
  }

  private setupHandlers(): void {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const toolList = Array.from(this.tools.values()).map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));

      return {
        tools: toolList,
      };
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const tool = this.tools.get(name);

      if (!tool) {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
      }

      try {
        StderrLogger.debug(`Calling tool "${name}" with args:`, args);
        const result = await tool.execute(args || {}, this.apiClient);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        StderrLogger.error(`Error executing tool "${name}":`, error);
        
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: error instanceof Error ? error.message : String(error),
            },
          ],
        };
      }
    });
  }

  getMcpServerInstance(): Server {
    return this.server;
  }
}
