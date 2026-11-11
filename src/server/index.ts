#!/usr/bin/env node

import 'dotenv/config';
import { createServerApp } from './app.js';
import { getServerConfig } from './config.js';

const config = getServerConfig();
const { app, service } = await createServerApp({ config });

const server = app.listen(config.port, config.host, () => {
  console.log(`[server] image2html listening on http://${config.host}:${config.port}`);
  console.log(`[server] users=${config.apiKeys.size}, concurrency=${config.jobConcurrency}`);
  console.log(`[server] data=${config.dataDir}`);
});

server.requestTimeout = 30_000;
server.headersTimeout = 35_000;

async function shutdown(signal: string) {
  console.log(`[server] received ${signal}, draining jobs`);
  server.close();
  await service.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
