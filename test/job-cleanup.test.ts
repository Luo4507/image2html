import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getServerConfig, type ServerConfig } from '../src/server/config.js';
import { JobService } from '../src/server/job-service.js';
import type { JobRecord, JobStatus } from '../src/server/job-queue.js';
import type { CodegenOptions } from '../src/types.js';

const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function config(dataDir: string, jobRetentionHours = 168): ServerConfig {
  return {
    host: '127.0.0.1',
    port: 0,
    dataDir,
    apiKeys: new Map(),
    maxUploadMb: 2,
    jobConcurrency: 1,
    maxQueueSize: 10,
    rateLimitPerMinute: 60,
    jobRetentionHours,
  };
}

const options: CodegenOptions = {
  framework: 'html',
  styleFramework: 'inline',
  componentLibrary: 'none',
  typescript: false,
  responsive: true,
  accessibility: true,
  pipeline: 'direct',
  qualityMode: 'fast',
  layoutMode: 'single',
  assetMode: 'none',
};

function converterFactory() {
  return {
    async convert() {
      return {
        success: true,
        code: {
          code: '<main>cleanup test</main>',
          filename: 'component.html',
          imports: [],
          components: [],
        },
      };
    },
    async close() {},
  };
}

async function createDataDir(name: string): Promise<string> {
  const dataDir = await mkdtemp(join(tmpdir(), `image2html-${name}-`));
  cleanup.push(dataDir);
  return dataDir;
}

async function persistJob(
  dataDir: string,
  id: string,
  status: JobStatus,
  completedAt?: string,
): Promise<JobRecord> {
  const jobDir = join(dataDir, 'jobs', id);
  await mkdir(jobDir, { recursive: true });
  const job: JobRecord = {
    id,
    userId: 'alice',
    status,
    createdAt: '2026-11-23T00:00:00.000Z',
    completedAt,
  };
  await writeFile(join(jobDir, 'job.json'), JSON.stringify(job), 'utf8');
  await writeFile(join(jobDir, 'artifact.txt'), id, 'utf8');
  return job;
}

describe('job storage cleanup', () => {
  it('removes uploaded copies after copying them without deleting external source files', async () => {
    const dataDir = await createDataDir('upload-cleanup');
    const uploadsDir = join(dataDir, 'uploads');
    await mkdir(uploadsDir, { recursive: true });
    const uploadedImage = join(uploadsDir, 'upload.png');
    const externalImage = join(dataDir, 'external.png');
    await copyFile('examples/login.png', uploadedImage);
    await copyFile('examples/login.png', externalImage);
    const service = new JobService({ config: config(dataDir), converterFactory });

    try {
      const uploadedJob = service.submit({ userId: 'alice', imagePath: uploadedImage, options, validate: false });
      await service.waitForIdle();
      expect(uploadedJob.status).toBe('succeeded');
      expect(existsSync(uploadedImage)).toBe(false);
      expect(existsSync(join(dataDir, 'jobs', uploadedJob.id, 'source.png'))).toBe(true);
      expect(await readdir(uploadsDir)).toEqual([]);

      const externalJob = service.submit({ userId: 'alice', imagePath: externalImage, options, validate: false });
      await service.waitForIdle();
      expect(externalJob.status).toBe('succeeded');
      expect(existsSync(externalImage)).toBe(true);
    } finally {
      await service.close();
    }
  });

  it('deletes expired terminal jobs while preserving recent, active and malformed records', async () => {
    const dataDir = await createDataDir('retention');
    const expiredSuccess = await persistJob(dataDir, 'expired-success', 'succeeded', '2026-11-23T08:00:00.000Z');
    const expiredFailure = await persistJob(dataDir, 'expired-failure', 'failed', '2026-11-23T08:00:00.000Z');
    const recentSuccess = await persistJob(dataDir, 'recent-success', 'succeeded', '2026-11-23T11:30:00.000Z');
    await persistJob(dataDir, 'old-running', 'running', '2026-11-23T08:00:00.000Z');
    const malformedDir = join(dataDir, 'jobs', 'malformed');
    await mkdir(malformedDir, { recursive: true });
    await writeFile(join(malformedDir, 'job.json'), '{', 'utf8');

    const service = new JobService({ config: config(dataDir, 1), converterFactory });
    service.queue.restore(expiredSuccess);
    service.queue.restore(expiredFailure);
    service.queue.restore(recentSuccess);

    try {
      const removed = await service.cleanupExpiredJobs(new Date('2026-11-23T12:00:00.000Z'));
      expect(removed).toBe(2);
      expect(existsSync(join(dataDir, 'jobs', 'expired-success'))).toBe(false);
      expect(existsSync(join(dataDir, 'jobs', 'expired-failure'))).toBe(false);
      expect(existsSync(join(dataDir, 'jobs', 'recent-success'))).toBe(true);
      expect(existsSync(join(dataDir, 'jobs', 'old-running'))).toBe(true);
      expect(existsSync(malformedDir)).toBe(true);
      expect(service.get('expired-success', 'alice')).toBeUndefined();
      expect(service.get('expired-failure', 'alice')).toBeUndefined();
      expect(service.get('recent-success', 'alice')?.status).toBe('succeeded');
      expect(service.stats).toMatchObject({ succeeded: 1, failed: 0 });
    } finally {
      await service.close();
    }
  });

  it('cleans expired jobs during restore and supports disabling retention', async () => {
    const dataDir = await createDataDir('startup-retention');
    await persistJob(dataDir, 'expired', 'succeeded', '2026-11-20T00:00:00.000Z');
    const service = new JobService({ config: config(dataDir, 1), converterFactory });
    try {
      await service.restore();
      expect(existsSync(join(dataDir, 'jobs', 'expired'))).toBe(false);
      expect(service.get('expired', 'alice')).toBeUndefined();
    } finally {
      await service.close();
    }

    const retainedDir = await createDataDir('disabled-retention');
    await persistJob(retainedDir, 'expired', 'succeeded', '2026-11-20T00:00:00.000Z');
    const retainedService = new JobService({ config: config(retainedDir, 0), converterFactory });
    try {
      expect(await retainedService.cleanupExpiredJobs()).toBe(0);
      expect(existsSync(join(retainedDir, 'jobs', 'expired'))).toBe(true);
    } finally {
      await retainedService.close();
    }
  });

  it('parses and validates the retention environment setting', () => {
    expect(getServerConfig({ API_KEYS: 'alice:test-key' }).jobRetentionHours).toBe(168);
    expect(getServerConfig({ API_KEYS: 'alice:test-key', JOB_RETENTION_HOURS: '0' }).jobRetentionHours).toBe(0);
    expect(getServerConfig({ API_KEYS: 'alice:test-key', JOB_RETENTION_HOURS: '24' }).jobRetentionHours).toBe(24);
    expect(() => getServerConfig({ API_KEYS: 'alice:test-key', JOB_RETENTION_HOURS: '-1' })).toThrow(
      'JOB_RETENTION_HOURS must be a non-negative number',
    );
  });
});
