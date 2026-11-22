import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LocalConversionCache,
  withLocalConversionCache,
} from '../src/cache/local-conversion-cache.js';
import type { DesignToCodeRequest, DesignToCodeResult } from '../src/types.js';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function cache(): Promise<LocalConversionCache> {
  const directory = await mkdtemp(join(tmpdir(), 'image2html-local-cache-'));
  directories.push(directory);
  return new LocalConversionCache(directory);
}

function request(overrides: Partial<DesignToCodeRequest> = {}): DesignToCodeRequest {
  return {
    image: { source: 'data:image/png;base64,aGVsbG8=', type: 'base64' },
    options: {
      framework: 'html', styleFramework: 'inline', componentLibrary: 'none',
      typescript: false, responsive: true, accessibility: true,
    },
    modelConfig: {
      visionModel: { baseUrl: 'http://vision.internal/v1', model: 'vision-a', apiKey: 'key-a' },
      codeModel: { baseUrl: 'http://code.internal/v1', model: 'code-a', apiKey: 'key-b' },
    },
    validationConfig: {
      threshold: 85, minContentSimilarity: 60, minEdgeSimilarity: 40,
      checkTextCoverage: true, minTextCoverage: 80,
      viewports: {
        desktop: { width: 1440, height: 900 },
        tablet: { width: 768, height: 1024 },
        mobile: { width: 375, height: 812 },
      },
      maxRetryCount: 4,
    },
    ...overrides,
  };
}

function result(passed = true): DesignToCodeResult {
  return {
    success: true,
    code: { code: '<html><body>cached</body></html>', filename: 'Generated.html', imports: [], components: [] },
    validation: {
      similarity: 100, passed, regions: [], suggestions: [],
      screenshots: { desktop: '' },
    },
    metrics: {
      analysisMs: 0, generationMs: 100, validationMs: 50, repairMs: 0,
      totalMs: 150, modelCalls: 1, repairIterations: 0,
    },
  };
}

describe('local conversion cache', () => {
  it('reuses passing results by content and isolates model or option changes', async () => {
    const store = await cache();
    const firstRequest = request();
    const convert = vi.fn().mockImplementation(async () => result());

    const first = await withLocalConversionCache(firstRequest, store, convert);
    const second = await withLocalConversionCache(request(), store, convert);
    expect(first.metrics?.cacheHit).toBeUndefined();
    expect(second.metrics).toMatchObject({
      cacheHit: true, totalMs: 0, modelCalls: 0, modelRequests: [],
    });
    expect(convert).toHaveBeenCalledTimes(1);

    const changedModel = request();
    changedModel.modelConfig.visionModel.model = 'vision-b';
    await withLocalConversionCache(changedModel, store, convert);
    const changedOptions = request({ options: { ...firstRequest.options, responsive: false } });
    await withLocalConversionCache(changedOptions, store, convert);
    const changedThinking = request();
    changedThinking.modelConfig.visionModel.enableThinking = false;
    await withLocalConversionCache(changedThinking, store, convert);
    expect(convert).toHaveBeenCalledTimes(4);
  });

  it('never stores execution failures or visually failed results', async () => {
    const store = await cache();
    const failedExecution: DesignToCodeResult = {
      success: false,
      code: { code: '', filename: '', imports: [], components: [] },
      error: 'model unavailable',
    };
    const convert = vi.fn()
      .mockResolvedValueOnce(failedExecution)
      .mockResolvedValueOnce(result(false))
      .mockResolvedValueOnce(result(true));

    await withLocalConversionCache(request(), store, convert);
    await withLocalConversionCache(request(), store, convert);
    const passing = await withLocalConversionCache(request(), store, convert);

    expect(convert).toHaveBeenCalledTimes(3);
    expect(passing.metrics?.cacheHit).toBeUndefined();
    expect(await readdir(store.directory)).toHaveLength(1);
  });
});
