import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
    jobRetentionHours: 168,
  };
}

const validation = {
  similarity: 96,
  passed: true,
  regions: [],
  suggestions: [],
  screenshots: { desktop: 'not-for-structured-results' },
  diffImage: 'not-for-structured-results',
};

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
        validation,
      };
    },
    async validate() {
      return { ...validation, similarity: 91, passed: false, suggestions: ['Adjust spacing'] };
    },
    async repair(_image: Buffer, code: any) {
      return {
        success: true,
        code: { ...code, code: '<main>remotely repaired</main>', filename: 'component.html' },
        validation,
        qualityHistory: [{ iteration: 0, score: 96, adopted: true, improved: true, validation }],
        metrics: { repairIterations: 1, modelCalls: 1 },
      };
    },
    async analyzeStructure() {
      return {
        page: { title: 'Remote page', type: 'dashboard', layout: { type: 'flex', direction: 'column' } },
        components: [],
        regions: [],
      };
    },
    async extractAssets(imageBase64: string, outputDir: string) {
      const path = join(outputDir, 'logo.png');
      await writeFile(path, Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64'));
      return [path];
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

  it('provides all five tools with remote Base64 images and structured results', async () => {
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
      expect(tools.tools.map((tool) => tool.name)).toEqual([
        'generate_component',
        'validate_design',
        'repair_component',
        'analyze_structure',
        'extract_assets',
      ]);
      expect(tools.tools.every((tool) => tool.outputSchema?.type === 'object')).toBe(true);
      expect(tools.tools[0]?.inputSchema.properties).toHaveProperty('image_base64');
      expect(tools.tools[0]?.inputSchema.required).toEqual([]);
      expect(tools.tools[1]?.inputSchema.properties).toHaveProperty('original_image_base64');

      const original = await readFile('examples/login.png');
      const imageBase64 = `data:image/png;base64,${original.toString('base64')}`;
      const generated = await client.callTool({
        name: 'generate_component',
        arguments: {
          image_base64: imageBase64,
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

      const checked = await client.callTool({
        name: 'validate_design',
        arguments: {
          original_image_base64: imageBase64,
          image_filename: 'login.png',
          code: '<main>current</main>',
        },
      });
      expect(checked.isError).not.toBe(true);
      expect(checked.structuredContent).toMatchObject({ success: true, similarity: 91, passed: false });
      expect(JSON.stringify(checked.structuredContent)).not.toContain('not-for-structured-results');

      const repaired = await client.callTool({
        name: 'repair_component',
        arguments: {
          original_image_base64: imageBase64,
          image_filename: 'login.png',
          code: '<main>current</main>',
        },
      });
      expect(repaired.isError).not.toBe(true);
      expect(repaired.structuredContent).toMatchObject({
        success: true,
        code: '<main>remotely repaired</main>',
        repairIterations: 1,
      });

      const analyzed = await client.callTool({
        name: 'analyze_structure',
        arguments: { image_base64: imageBase64, image_filename: 'login.png' },
      });
      expect(analyzed.isError).not.toBe(true);
      expect(analyzed.structuredContent).toMatchObject({
        success: true,
        structure: { page: { title: 'Remote page' } },
      });

      const extracted = await client.callTool({
        name: 'extract_assets',
        arguments: { image_base64: imageBase64, image_filename: 'login.png' },
      });
      expect(extracted.isError).not.toBe(true);
      const assets = (extracted.structuredContent as any).assets;
      expect(assets).toHaveLength(1);
      expect(assets[0]).toMatchObject({ name: 'logo.png', mimeType: 'image/png' });
      expect(Buffer.from(assets[0].data, 'base64').equals(original)).toBe(true);
    } finally {
      await client.close();
      await service.close();
      await closeServer();
      await rm(dataDir, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  });
});
