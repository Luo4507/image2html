import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JobService, type JobServiceOptions } from '../src/server/job-service.js';
import type { CodegenOptions } from '../src/types.js';

const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function options(): CodegenOptions {
  return {
    framework: 'html', styleFramework: 'inline', componentLibrary: 'none',
    typescript: false, responsive: true, accessibility: true,
    pipeline: 'direct', qualityMode: 'fast', assetMode: 'none',
  };
}

function config(dataDir: string): JobServiceOptions['config'] {
  return {
    host: '127.0.0.1', port: 0, dataDir, apiKeys: new Map(),
    maxUploadMb: 2, jobConcurrency: 1, maxQueueSize: 10, rateLimitPerMinute: 60,
  };
}

function converter() {
  return {
    async convert(request: any) {
      request.onProgress?.({ stage: 'preview', message: 'preview', timestamp: new Date().toISOString(), codeSnapshot: '<main>recovered</main>' });
      return {
        success: true,
        code: { code: '<main>recovered</main>', filename: 'recovered.html', imports: [], components: [] },
        validation: {
          similarity: 99, passed: true, regions: [], suggestions: [],
          screenshots: { desktop: '' },
        },
        metrics: {
          analysisMs: 0, generationMs: 1, validationMs: 0, repairMs: 0,
          totalMs: 1, modelCalls: 1, repairIterations: 0,
        },
      };
    },
    async close() {},
  };
}

describe('job persistence and recovery', () => {
  it('restores completed jobs and their conversion cache without another model call', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'image2html-job-recovery-'));
    cleanup.push(dataDir);
    const imagePath = 'examples/fixtures/demo/login.png';
    const firstConvert = vi.fn();
    const first = new JobService({
      config: config(dataDir),
      converterFactory: () => ({ ...converter(), convert(request: any) { firstConvert(request); return converter().convert(request); } }),
    });
    const original = first.submit({ userId: 'alice', imagePath, options: options(), validate: true });
    await first.waitForIdle();
    await first.close();

    const secondConvert = vi.fn();
    const second = new JobService({
      config: config(dataDir),
      converterFactory: () => ({ ...converter(), convert(request: any) { secondConvert(request); return converter().convert(request); } }),
    });
    await second.restore();

    expect(second.get(original.id, 'alice')?.status).toBe('succeeded');
    expect(second.get(original.id, 'bob')).toBeUndefined();
    expect(await readFile(second.artifactPath(second.get(original.id, 'alice')!, 'code')!, 'utf8')).toContain('recovered');

    const cached = second.submit({ userId: 'alice', imagePath, options: options(), validate: true });
    await second.waitForIdle();
    expect(second.get(cached.id, 'alice')?.result?.metrics?.cacheHit).toBe(true);
    expect(secondConvert).not.toHaveBeenCalled();
    expect(firstConvert).toHaveBeenCalledOnce();
    await second.close();
  });

  it('requeues persisted running and queued jobs', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'image2html-job-requeue-'));
    cleanup.push(dataDir);

    for (const [id, status] of [['running-job', 'running'], ['queued-job', 'queued']] as const) {
      const dir = join(dataDir, 'jobs', id);
      await mkdir(dir, { recursive: true });
      await copyFile('examples/fixtures/demo/login.png', join(dir, 'source.png'));
      await writeFile(join(dir, 'job.json'), JSON.stringify({
        id, userId: 'alice', status, createdAt: new Date().toISOString(),
      }));
      await writeFile(join(dir, 'input.json'), JSON.stringify({
        userId: 'alice', imagePath: join(dir, 'source.png'), options: options(), validate: true,
      }));
    }

    const service = new JobService({ config: config(dataDir), converterFactory: converter });
    await service.restore();
    await service.waitForIdle();

    expect(service.get('running-job', 'alice')?.status).toBe('succeeded');
    expect(service.get('queued-job', 'alice')?.status).toBe('succeeded');
    await service.close();
  });
});
