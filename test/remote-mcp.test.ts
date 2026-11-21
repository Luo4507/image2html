import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRemoteMCPServer } from '../src/mcp/remote-server.js';
import { getRemoteMCPConfig, RemoteMCPClient } from '../src/mcp/remote-client.js';
import { createServerApp } from '../src/server/app.js';
import type { ServerConfig } from '../src/server/config.js';

const imagePath = 'examples/demo/login.png';
const compactValidation = {
  similarity: 91,
  passed: true,
  regions: [],
  suggestions: [],
  quality: {
    overallSimilarity: 91,
    contentSimilarity: 90,
    edgeSimilarity: 89,
    contentRatio: 1,
    qualityScore: 91,
  },
};
const metrics = {
  analysisMs: 0,
  generationMs: 10,
  validationMs: 5,
  repairMs: 0,
  totalMs: 15,
  modelCalls: 1,
  repairIterations: 0,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  while (cleanups.length) await cleanups.pop()!();
});

describe('remote MCP generation adapter', () => {
  it('reads central service settings without model credentials', () => {
    expect(getRemoteMCPConfig({
      IMAGE2HTML_URL: 'http://image2html.internal:3000/',
      IMAGE2HTML_API_KEY: 'user-secret',
    })).toMatchObject({
      baseUrl: 'http://image2html.internal:3000',
      apiKey: 'user-secret',
      pollIntervalMs: 1000,
      timeoutMs: 600000,
    });
    expect(() => getRemoteMCPConfig({})).toThrow('IMAGE2HTML_URL');
  });

  it('uploads an image, polls the job and returns structured source data', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ job: { id: 'job-1', status: 'queued' } }, 202))
      .mockResolvedValueOnce(jsonResponse({
        job: {
          id: 'job-1',
          status: 'succeeded',
          result: {
            codeFilename: 'Demo.tsx',
            imports: ['react'],
            components: ['Demo'],
            validation: compactValidation,
            metrics,
            artifacts: { code: '/v1/jobs/job-1/artifacts/code' },
          },
        },
      }))
      .mockResolvedValueOnce(new Response('export default function Demo() {}', { status: 200 }));
    const client = new RemoteMCPClient({
      baseUrl: 'http://image2html.internal:3000',
      apiKey: 'user-secret',
      pollIntervalMs: 0,
      fetchImpl: fetchMock,
    });

    const result = await client.generateComponent({
      image_path: imagePath,
      framework: 'react',
      style_framework: 'inline',
      component_library: 'antd',
      typescript: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [submitUrl, submitInit] = fetchMock.mock.calls[0];
    expect(submitUrl).toBe('http://image2html.internal:3000/v1/jobs');
    expect(submitInit.headers).toMatchObject({ Authorization: 'Bearer user-secret' });
    const body = submitInit.body as FormData;
    expect(body.get('framework')).toBe('react');
    expect(body.get('styleFramework')).toBe('inline');
    expect(body.get('validate')).toBe('true');
    expect(body.get('image')).toBeInstanceOf(File);
    expect(result.structuredContent).toMatchObject({
      success: true,
      code: 'export default function Demo() {}',
      filename: 'Demo.tsx',
      imports: ['react'],
      components: ['Demo'],
      validation: { similarity: 91, passed: true },
      metrics: { modelCalls: 1 },
    });
  });

  it('maps authentication failures without exposing the API key', async () => {
    const client = new RemoteMCPClient({
      baseUrl: 'http://image2html.internal:3000',
      apiKey: 'do-not-expose',
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse({ message: 'Unauthorized' }, 401)),
    });

    const result = await client.generateComponent({ image_path: imagePath });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      success: false,
      error: { code: 'REMOTE_UNAUTHORIZED' },
    });
    expect(JSON.stringify(result)).not.toContain('do-not-expose');
  });

  it('publishes only generate_component through the remote MCP server', async () => {
    const remote = {
      generateComponent: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'ok' }],
        structuredContent: { success: true, code: '<main>remote</main>' },
      }),
    };
    const server = await createRemoteMCPServer({ client: remote });
    const client = new Client({ name: 'remote-protocol-test', version: '1.0.0' }, { capabilities: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual(['generate_component']);
      const generated = await client.callTool({
        name: 'generate_component',
        arguments: { image_path: imagePath },
      });
      expect(generated.structuredContent).toMatchObject({ success: true, code: '<main>remote</main>' });
      const unknown = await client.callTool({ name: 'validate_design', arguments: {} });
      expect(unknown).toMatchObject({ isError: true, structuredContent: { error: { code: 'UNKNOWN_TOOL' } } });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('runs against the real authenticated HTTP job service with a mocked converter', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'image2html-remote-test-'));
    const config: ServerConfig = {
      host: '127.0.0.1',
      port: 0,
      dataDir,
      apiKeys: new Map([['alice-key', 'alice']]),
      maxUploadMb: 2,
      jobConcurrency: 1,
      maxQueueSize: 10,
      rateLimitPerMinute: 60,
    };
    const { app, service } = await createServerApp({
      config,
      converterFactory: () => ({
        async convert() {
          return {
            success: true,
            code: {
              code: '<html><body>remote</body></html>',
              filename: 'component.html',
              imports: [],
              components: [],
            },
            validation: {
              ...compactValidation,
              screenshots: { desktop: '' },
              diffImage: 'not-for-structured-results',
            },
            metrics,
          };
        },
        async close() {},
      }),
    });
    const httpServer = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => httpServer.once('listening', resolve));
    cleanups.push(async () => {
      await service.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      await rm(dataDir, { recursive: true, force: true });
    });
    const address = httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Missing test server address');
    const client = new RemoteMCPClient({
      baseUrl: `http://127.0.0.1:${address.port}`,
      apiKey: 'alice-key',
      pollIntervalMs: 5,
    });

    const result = await client.generateComponent({
      image_path: imagePath,
      framework: 'html',
      style_framework: 'inline',
      component_library: 'none',
      typescript: false,
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      success: true,
      code: '<html><body>remote</body></html>',
      filename: 'component.html',
      validation: { similarity: 91, passed: true },
    });
    expect(JSON.stringify(result.structuredContent)).not.toContain('not-for-structured-results');
  });
});
