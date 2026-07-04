#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { KoteMcpServer } from './server.js';
import { StderrLogger } from './logger/stderr.logger.js';

async function main() {
  StderrLogger.info('Starting Kote MCP Server...');
  
  try {
    const koteServer = new KoteMcpServer();
    const transport = new StdioServerTransport();
    
    await koteServer.getMcpServerInstance().connect(transport);
    StderrLogger.info('Kote MCP Server successfully connected to stdio transport.');
  } catch (error) {
    StderrLogger.error('Failed to start Kote MCP Server:', error);
    process.exit(1);
  }
}

// Global exception handling to prevent stdout corruption
process.on('uncaughtException', (error) => {
  StderrLogger.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason) => {
  StderrLogger.error('Unhandled Rejection:', reason);
});

main();
