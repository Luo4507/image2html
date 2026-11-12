import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServerApp } from '../src/server/app.js';
import type { ServerConfig } from '../src/server/config.js';

describe('multi-user HTTP server', () => {
  let dataDir: string;
  let cleanup: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'image2html-test-'));
  });

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
    await rm(dataDir, { recursive: true, force: true });
  });

  function config(): ServerConfig {
    return {
      host: '127.0.0.1',
      port: 0,
      dataDir,
      apiKeys: new Map([
        ['alice-key', 'alice'],
        ['bob-key', 'bob'],
      ]),
      maxUploadMb: 2,
      jobConcurrency: 1,
      maxQueueSize: 10,
      rateLimitPerMinute: 60,
    };
  }

  it('exposes health without credentials and protects jobs', async () => {
    const { app, service } = await createServerApp({
      config: config(),
      converterFactory: () => {
        throw new Error('not used');
      },
    });
    cleanup = () => service.close();

    await request(app).get('/health').expect(200);
    await request(app).post('/v1/jobs').expect(401);
  });

  it('creates jobs, isolates users, and serves artifacts', async () => {
    let receivedOptions: unknown;
    const { app, service } = await createServerApp({
      config: config(),
      converterFactory: () => ({
        async convert(request) {
          receivedOptions = request.options;
          request.onProgress?.({
            stage: 'preview',
            message: 'preview ready',
            timestamp: new Date().toISOString(),
            codeSnapshot: '<html><body>demo</body></html>',
          });
          request.onProgress?.({
            stage: 'completed',
            message: 'done',
            timestamp: new Date().toISOString(),
          });
          return {
            success: true,
            structure: { page: { title: 'Demo' } },
            code: {
              code: '<html><body>demo</body></html>',
              filename: 'demo.html',
              imports: [],
              components: [],
            },
            validation: {
              similarity: 92,
              passed: true,
              regions: [],
              suggestions: [],
              screenshots: {},
            },
          };
        },
        async close() {},
      }),
    });
    cleanup = () => service.close();

    const created = await request(app)
      .post('/v1/jobs')
      .set('Authorization', 'Bearer alice-key')
      .field('framework', 'html')
      .field('pipeline', 'structured')
      .field('qualityMode', 'precision')
      .field('layoutMode', 'single')
      .field('assetMode', 'extract')
      .attach('image', 'examples/fixtures/demo/login.png')
      .expect(202);

    const jobId = created.body.job.id;
    await service.waitForIdle();

    const completed = await request(app)
      .get(`/v1/jobs/${jobId}`)
      .set('Authorization', 'Bearer alice-key')
      .expect(200);

    expect(completed.body.job.status).toBe('succeeded');
    expect(receivedOptions).toMatchObject({ pipeline: 'structured', qualityMode: 'precision', layoutMode: 'single', assetMode: 'extract' });
    expect(completed.body.job.result.similarity).toBe(92);

    await request(app)
      .get(`/v1/jobs/${jobId}`)
      .set('Authorization', 'Bearer bob-key')
      .expect(404);

    const artifact = await request(app)
      .get(completed.body.job.result.artifacts.code)
      .set('Authorization', 'Bearer alice-key')
      .expect(200);

    expect(artifact.text).toContain('demo');

    const preview = await request(app)
      .get(`/v1/jobs/${jobId}/preview`)
      .set('Authorization', 'Bearer alice-key')
      .expect(200);
    expect(preview.text).toContain('demo');

    const events = await request(app)
      .get(`/v1/jobs/${jobId}/events`)
      .set('Authorization', 'Bearer alice-key')
      .expect(200);
    expect(events.text).toContain('preview ready');
  });

  it('passes new options and rejects incompatible frameworks before creating a job', async () => {
    const { app, service } = await createServerApp({
      config: config(),
      converterFactory: () => { throw new Error('must not be called'); },
    });
    cleanup = () => service.close();

    await request(app)
      .post('/v1/jobs')
      .set('Authorization', 'Bearer alice-key')
      .field('framework', 'react')
      .field('componentLibrary', 'element')
      .attach('image', 'examples/fixtures/demo/login.png')
      .expect(400);
  });
});
