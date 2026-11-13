import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JobService } from '../src/server/job-service.js';
import type { ServerConfig } from '../src/server/config.js';
import type { ConversionProgressEvent } from '../src/types.js';

describe('JobService progress events', () => {
  it('stores previews and streams events only to the job owner', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'image2html-events-'));
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
    const service = new JobService({
      config,
      converterFactory: () => ({
        async convert(request) {
          request.onProgress?.({
            stage: 'preview',
            message: 'preview ready',
            timestamp: new Date().toISOString(),
            codeSnapshot: '<html><body>live</body></html>',
          });
          return {
            success: true,
            code: {
              code: '<html><body>live</body></html>',
              filename: 'live.html',
              imports: [],
              components: [],
            },
          };
        },
        async close() {},
      }),
    });

    try {
      const job = service.submit({
        userId: 'alice',
        imagePath: 'examples/demo/login-design.png',
        options: {
          framework: 'html',
          styleFramework: 'inline',
          componentLibrary: 'none',
          typescript: false,
          responsive: false,
          accessibility: false,
        },
        validate: false,
      });
      const events: ConversionProgressEvent[] = [];
      const unsubscribe = service.subscribe(job.id, 'alice', (event) => events.push(event));

      await service.waitForIdle();

      expect(service.getPreview(job.id, 'alice')).toContain('live');
      expect(events.some((event) => event.stage === 'preview')).toBe(true);
      expect(service.subscribe(job.id, 'bob', () => {})).toBeUndefined();
      unsubscribe?.();
    } finally {
      await service.close();
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});
