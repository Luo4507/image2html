import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { RemoteMCPClient } from '../src/mcp/remote-client.js';
import { createServerApp } from '../src/server/app.js';
import type { ServerConfig } from '../src/server/config.js';

const validation = {
  similarity: 88,
  passed: false,
  regions: [],
  suggestions: ['Adjust spacing'],
  screenshots: { desktop: 'not-for-structured-results' },
  diffImage: 'not-for-structured-results',
};

describe('stdio remote adapter tool HTTP bridge', () => {
  it('runs validation, repair, analysis and asset extraction against the real HTTP service', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'image2html-remote-tools-'));
    const close = vi.fn().mockResolvedValue(undefined);
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
        async convert() { throw new Error('not used'); },
        async validate() { return validation; },
        async repair(_image: Buffer, code: any) {
          return {
            success: true,
            code: { ...code, code: '<main>bridge repaired</main>' },
            validation: { ...validation, similarity: 95, passed: true },
            qualityHistory: [],
          };
        },
        async analyzeStructure() {
          return { page: { title: 'Bridge page', layout: {} }, components: [], regions: [] };
        },
        async extractAssets(imageBase64: string, outputDir: string) {
          const path = join(outputDir, 'icon.png');
          await writeFile(path, Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64'));
          return [path];
        },
        close,
      }),
    });
    const httpServer = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => httpServer.once('listening', resolve));
    const address = httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Missing test server address');
    const client = new RemoteMCPClient({
      baseUrl: `http://127.0.0.1:${address.port}`,
      apiKey: 'alice-key',
    });

    try {
      const checked = await client.validateDesign({
        original_image: 'examples/login.png',
        code: '<main>current</main>',
      });
      expect(checked.isError).not.toBe(true);
      expect(checked.structuredContent).toMatchObject({ success: true, similarity: 88, passed: false });
      expect(JSON.stringify(checked.structuredContent)).not.toContain('not-for-structured-results');

      const repaired = await client.repairComponent({
        original_image: 'examples/login.png',
        code: '<main>current</main>',
      });
      expect(repaired.isError).not.toBe(true);
      expect(repaired.structuredContent).toMatchObject({ success: true, code: '<main>bridge repaired</main>' });

      const analyzed = await client.analyzeStructure({ image_path: 'examples/login.png' });
      expect(analyzed.isError).not.toBe(true);
      expect(analyzed.structuredContent).toMatchObject({
        success: true,
        structure: { page: { title: 'Bridge page' } },
      });

      const extracted = await client.extractAssets({ image_path: 'examples/login.png' });
      expect(extracted.isError).not.toBe(true);
      expect(extracted.structuredContent).toMatchObject({
        success: true,
        assets: [{ name: 'icon.png', mimeType: 'image/png' }],
      });
      expect(close).toHaveBeenCalledTimes(4);
    } finally {
      await service.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});
