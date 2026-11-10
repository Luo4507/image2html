#!/usr/bin/env node

/**
 * MCP Server 入口
 */

import { startMCPServer } from './server.js';

// 启动 MCP Server
startMCPServer().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
