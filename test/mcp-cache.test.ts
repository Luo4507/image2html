import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDefaultModelConfig, getDefaultValidationConfig } from '../src/config.js';
import {
  LocalConversionCache,
  createLocalConversionCacheKey,
} from '../src/cache/local-conversion-cache.js';
import { handleGenerateComponent } from '../src/mcp/server.js';
import type { DesignToCode, DesignToCodeRequest } from '../src/index.js';

const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('MCP local conversion cache', () => {
  it('returns a cached passing result without invoking the converter', async () => {
    vi.stubEnv('LLM_VL_BASE_URL', 'http://127.0.0.1:1/v1');
    vi.stubEnv('LLM_BASE_URL', 'http://127.0.0.1:1/v1');
    vi.stubEnv('LLM_VL_API_KEY', 'test');
    vi.stubEnv('LLM_API_KEY', 'test');
    vi.stubEnv('LLM_VL_MODEL', 'cache-test');
    vi.stubEnv('LLM_MODEL', 'cache-test');
    vi.stubEnv('CONVERSION_CACHE', 'true');
    const directory = await mkdtemp(join(tmpdir(), 'image2html-mcp-cache-'));
    directories.push(directory);
    vi.stubEnv('CONVERSION_CACHE_DIR', directory);

    const conversionRequest: DesignToCodeRequest = {
      image: { source: 'examples/login.png', type: 'path', filename: 'login.png' },
      options: {
        framework: 'html', styleFramework: 'inline', componentLibrary: 'none',
        typescript: false, responsive: true, accessibility: true,
        pipeline: 'direct', qualityMode: 'precision', layoutMode: 'single', assetMode: 'none',
      },
      modelConfig: getDefaultModelConfig(),
      validationConfig: getDefaultValidationConfig(),
    };
    const cache = new LocalConversionCache(directory);
    const key = createLocalConversionCacheKey(await readFile('examples/login.png'), conversionRequest);
    await cache.write(key, {
      success: true,
      code: { code: '<html><body>MCP cache</body></html>', filename: 'Generated.html', imports: [], components: [] },
      validation: { similarity: 100, passed: true, regions: [], suggestions: [], screenshots: { desktop: '' } },
    });
    const convert = vi.fn().mockRejectedValue(new Error('must not call converter'));
    const d2c = { convert } as unknown as DesignToCode;

    const response = await handleGenerateComponent(d2c, {
      image_path: 'examples/login.png', framework: 'html', style_framework: 'inline',
      component_library: 'none', typescript: false,
    });

    expect(convert).not.toHaveBeenCalled();
    expect(response.structuredContent).toMatchObject({
      success: true,
      code: '<html><body>MCP cache</body></html>',
      metrics: { cacheHit: true, modelCalls: 0, totalMs: 0 },
    });
  });
});
