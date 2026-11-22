import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignToCode } from '../src/index.js';
import { shouldUseSegmentedLayout } from '../src/segmented-generator.js';
import type { CodegenOptions } from '../src/types.js';

const options: CodegenOptions = {
  framework: 'html', styleFramework: 'inline', componentLibrary: 'none',
  typescript: false, responsive: true, accessibility: true, layoutMode: 'auto',
};

function response(text: string): Response {
  const stream = new ReadableStream({
    start(controller) {
      const payload = JSON.stringify({ choices: [{ delta: { content: text } }] });
      controller.enqueue(new TextEncoder().encode(`data: ${payload}\n\ndata: [DONE]\n\n`));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('automatic layout selection', () => {
  it('only auto-segments tall screenshots', () => {
    expect(shouldUseSegmentedLayout(1440, 900)).toBe(false);
    expect(shouldUseSegmentedLayout(375, 812)).toBe(false);
    expect(shouldUseSegmentedLayout(1000, 1800)).toBe(true);
    expect(shouldUseSegmentedLayout(2000, 2400)).toBe(true);
  });

  it('uses the segmented pipeline for a tall image in auto mode', async () => {
    const image = await sharp({
      create: { width: 400, height: 1800, channels: 3, background: '#ffffff' },
    }).png().toBuffer();
    const converter = new DesignToCode();
    const segmented = vi.spyOn(converter as any, 'generateSegmentedHtml').mockResolvedValue({
      code: '<html><body>segmented</body></html>', filename: 'Generated.html', imports: [], components: [],
    });

    const result = await converter.generateDirectCode(`data:image/png;base64,${image.toString('base64')}`, options);
    expect(result.code).toContain('segmented');
    expect(segmented).toHaveBeenCalledTimes(1);
    await converter.close();
  });

  it('keeps ordinary images on the single-page pipeline in auto mode', async () => {
    const image = await sharp({
      create: { width: 400, height: 300, channels: 3, background: '#ffffff' },
    }).png().toBuffer();
    const converter = new DesignToCode();
    const segmented = vi.spyOn(converter as any, 'generateSegmentedHtml');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response('<html><body>single</body></html>')));

    const result = await converter.generateDirectCode(`data:image/png;base64,${image.toString('base64')}`, options);
    expect(result.code).toContain('single');
    expect(segmented).not.toHaveBeenCalled();
    await converter.close();
  });
});
