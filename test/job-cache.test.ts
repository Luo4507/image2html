import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JobService } from '../src/server/job-service.js';
import type { ServerConfig } from '../src/server/config.js';
import type { CodegenOptions } from '../src/types.js';

describe('JobService conversion cache', () => {
  it('reuses identical conversions while keeping job artifacts isolated', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'image2html-cache-'));
    const copiedImage = join(dataDir, 'copied-design.png');
    await copyFile('examples/fixtures/login-design.png', copiedImage);
    const config: ServerConfig = {
      host: '127.0.0.1',
      port: 0,
      dataDir,
      apiKeys: new Map(),
      maxUploadMb: 2,
      jobConcurrency: 1,
      maxQueueSize: 10,
      rateLimitPerMinute: 60,
    };
    const options: CodegenOptions = {
      framework: 'html',
      styleFramework: 'inline',
      componentLibrary: 'none',
      typescript: false,
      responsive: true,
      accessibility: true,
    };
    let conversionCount = 0;
    const service = new JobService({
      config,
      converterFactory: () => ({
        async convert() {
          conversionCount += 1;
          return {
            success: true,
            code: {
              code: '<html><body>cached demo</body></html>',
              filename: 'cached.html',
              imports: [],
              components: [],
            },
            metrics: {
              analysisMs: 0,
              generationMs: 100,
              validationMs: 0,
              repairMs: 0,
              totalMs: 100,
              modelCalls: 1,
              repairIterations: 0,
            },
          };
        },
        async close() {},
      }),
    });

    try {
      const first = service.submit({
        userId: 'alice',
        imagePath: 'examples/fixtures/login-design.png',
        options,
        validate: false,
      });
      await service.waitForIdle();

      const second = service.submit({
        userId: 'bob',
        imagePath: copiedImage,
        options: { ...options },
        validate: false,
      });
      await service.waitForIdle();

      expect(conversionCount).toBe(1);
      expect(service.get(second.id, 'bob')?.result?.metrics?.cacheHit).toBe(true);
      expect(service.get(second.id, 'bob')?.result?.metrics?.modelCalls).toBe(0);
      expect(service.get(second.id, 'bob')?.result?.metrics?.totalMs).toBe(0);
      expect(service.get(first.id, 'bob')).toBeUndefined();
      expect(service.getPreview(second.id, 'bob')).toContain('cached demo');
      expect(service.getEvents(second.id, 'bob')?.some((event) => event.stage === 'completed')).toBe(true);

      const firstCodePath = service.artifactPath(first, 'code')!;
      const secondCodePath = service.artifactPath(second, 'code')!;
      expect(secondCodePath).not.toBe(firstCodePath);
      expect(await readFile(secondCodePath, 'utf8')).toContain('cached demo');

      service.submit({
        userId: 'bob',
        imagePath: copiedImage,
        options: { ...options, responsive: false },
        validate: false,
      });
      await service.waitForIdle();
      expect(conversionCount).toBe(2);
    } finally {
      await service.close();
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});
