import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignToCode } from '../src/index.js';
import { getDefaultCodegenOptions, getDefaultModelConfig } from '../src/config.js';
import { buildDirectGenerationPrompt } from '../src/prompts/direct-generation.js';
import type { GeneratedAsset } from '../src/types.js';

const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const asset: GeneratedAsset = {
  name: 'logo.png', mimeType: 'image/png',
  data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z6XcAAAAASUVORK5CYII=',
};

describe('asset generation manifest', () => {
  it('lists only extracted public asset URLs', () => {
    const prompt = buildDirectGenerationPrompt(getDefaultCodegenOptions(), [asset]);
    expect(prompt).toContain('/assets/logo.png');
    expect(prompt).toContain('只能使用');
  });
});

describe('conversion asset integration', () => {
  it('extracts assets before generation and attaches them to the result', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'image2html-conversion-asset-test-'));
    cleanup.push(dir);
    const path = join(dir, 'logo.png');
    await writeFile(path, Buffer.from(asset.data, 'base64'));

    const converter = new DesignToCode();
    let receivedAssets: GeneratedAsset[] | undefined;
    const extract = vi.fn().mockResolvedValue([path]);
    (converter as any).extractAssets = extract;
    (converter as any).generateDirectCode = async (_image: string, _options: unknown, _progress: unknown, assets: GeneratedAsset[]) => {
      receivedAssets = assets;
      return { code: '<img src="/assets/logo.png">', filename: 'Demo.html', imports: [], components: [] };
    };

    const result = await converter.convert({
      image: { source: 'data:image/png;base64,aGVsbG8=', type: 'base64' },
      options: { ...getDefaultCodegenOptions(), framework: 'html', styleFramework: 'inline', componentLibrary: 'none', assetMode: 'extract' },
      modelConfig: getDefaultModelConfig(),
    });

    expect(result.success).toBe(true);
    expect(extract).toHaveBeenCalledOnce();
    expect(receivedAssets?.[0].name).toBe('logo.png');
    expect(result.code.assets?.[0].data).toBe(asset.data);
    expect(result.metrics?.modelCalls).toBe(2);
    await converter.close();
  });

  it('does not call the extractor in the default asset mode', async () => {
    const converter = new DesignToCode();
    const extract = vi.fn();
    (converter as any).extractAssets = extract;
    (converter as any).generateDirectCode = async () => ({
      code: '<main>no assets</main>', filename: 'Demo.html', imports: [], components: [],
    });

    const result = await converter.convert({
      image: { source: 'data:image/png;base64,aGVsbG8=', type: 'base64' },
      options: { ...getDefaultCodegenOptions(), framework: 'html', styleFramework: 'inline', componentLibrary: 'none' },
      modelConfig: getDefaultModelConfig(),
    });

    expect(result.success).toBe(true);
    expect(extract).not.toHaveBeenCalled();
    expect(result.metrics?.modelCalls).toBe(1);
    await converter.close();
  });
});
