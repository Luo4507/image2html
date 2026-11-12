import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { extractImageAssets } from '../src/assets/asset-extractor.js';
import type { DesignToCode } from '../src/index.js';
import { handleExtractAssets } from '../src/mcp/server.js';
import { parseAssetRegions } from '../src/prompts/asset-detection.js';

describe('asset extraction', () => {
  it('parses model-identified asset regions', () => {
    const regions = parseAssetRegions('{"assets":[{"name":"logo","x":1,"y":2,"width":20,"height":30}]}');
    expect(regions[0].name).toBe('logo');
  });

  it('crops a reusable asset from the source image', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'image2html-assets-'));
    const image = await sharp({
      create: { width: 100, height: 100, channels: 4, background: '#ffffff' },
    }).png().toBuffer();

    try {
      const [path] = await extractImageAssets(image, [
        { name: 'logo', x: 10, y: 10, width: 20, height: 20 },
      ], outputDir);
      const metadata = await sharp(await readFile(path)).metadata();
      expect(metadata.width).toBe(20);
      expect(metadata.height).toBe(20);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
  it('handles MCP asset extraction requests', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'image2html-mcp-assets-'));
    const imagePath = join(outputDir, 'design.png');
    const image = await sharp({
      create: { width: 100, height: 100, channels: 4, background: '#ffffff' },
    }).png().toBuffer();
    await writeFile(imagePath, image);

    try {
      const d2c = {
        async extractAssets(imageBase64: string, targetDir: string) {
          expect(imageBase64).toMatch(/^data:image\/png;base64,/);
          expect(targetDir).toBe(outputDir);
          return [join(outputDir, 'logo.png')];
        },
      };
      const result = await handleExtractAssets(d2c as unknown as DesignToCode, {
        image_path: imagePath,
        output_dir: outputDir,
      });
      expect(result.content[0].text).toContain('logo.png');
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
