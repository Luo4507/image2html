import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createServerApp } from '../src/server/app.js';
import type { ServerConfig } from '../src/server/config.js';

function config(dataDir: string): ServerConfig {
  return {
    host: '127.0.0.1',
    port: 0,
    dataDir,
    apiKeys: new Map([['alice-key', 'alice']]),
    maxUploadMb: 2,
    jobConcurrency: 1,
    maxQueueSize: 10,
    rateLimitPerMinute: 60,
  };
}

function converter(receivedImage: { current?: Buffer }) {
  return () => ({
    async convert(input: any) {
      receivedImage.current = await readFile(input.image.source);
      input.onProgress?.({
        stage: 'completed',
        message: 'done',
        timestamp: new Date().toISOString(),
      });
      return {
        success: true,
        code: {
          code: '<html><body>native remote MCP</body></html>',
          filename: 'component.html',
          imports: [],
          components: [],
        },
        validation: {
          similarity: 96,
          passed: true,
          regions: [],
          suggestions: [],
          screenshots: {},
        },
      };
    },
    async close() {},
  });
}

describe('native Streamable HTTP MCP', () => {
  it('requires the same API key as the job API', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'image2html-native-mcp-auth-'));
    const { app, service } = await createServerApp({
      config: config(dataDir),
      converterFactory: () => { throw new Error('not used'); },
    });
    try {
      await request(app)
        .post('/mcp')
        .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
        .expect(401);
    } finally {
      await service.close();
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it('lists tools and generates from a remote Base64 image without a local MCP process', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'image2html-native-mcp-'));
    const receivedImage: { current?: Buffer } = {};
    const { app, service } = await createServerApp({
      config: config(dataDir),
      converterFactory: converter(receivedImage),
    });
    const httpServer = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => httpServer.once('listening', resolve));
    const address = httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Missing test server address');

    const client = new Client({ name: 'native-remote-test', version: '1.0.0' }, { capabilities: {} });
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${address.port}/mcp`),
      { requestInit: { headers: { Authorization: 'Bearer alice-key' } } },
    );
    const closeServer = () => new Promise<void>((resolve, reject) => {
      httpServer.close((error) => error ? reject(error) : resolve());
    });

    try {
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual(['generate_component']);
      expect(tools.tools[0]?.inputSchema.properties).toHaveProperty('image_base64');
      expect(tools.tools[0]?.inputSchema.required).toEqual([]);

      const original = await readFile('examples/login.png');
      const generated = await client.callTool({
        name: 'generate_component',
        arguments: {
          image_base64: `data:image/png;base64,${original.toString('base64')}`,
          image_filename: 'login.png',
          framework: 'html',
          style_framework: 'inline',
          component_library: 'none',
          typescript: false,
          quality_mode: 'precision',
        },
      });

      expect(generated.isError).not.toBe(true);
      expect(generated.structuredContent).toMatchObject({
        success: true,
        code: '<html><body>native remote MCP</body></html>',
        filename: 'component.html',
        validation: { similarity: 96, passed: true },
      });
      expect(receivedImage.current?.equals(original)).toBe(true);
    } finally {
      await client.close();
      await service.close();
      await closeServer();
      await rm(dataDir, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  });
});
