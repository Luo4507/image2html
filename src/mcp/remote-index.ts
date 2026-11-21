#!/usr/bin/env node

import 'dotenv/config';
import { startRemoteMCPServer } from './remote-server.js';

startRemoteMCPServer().catch((error) => {
  console.error('Failed to start remote MCP adapter:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
