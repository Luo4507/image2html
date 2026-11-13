import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignToCode } from '../src/index.js';
import type { ValidationResult } from '../src/types.js';

function response(text: string): Response {
  const payload = JSON.stringify({ choices: [{ delta: { content: text } }] });
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`data: ${payload}\n\ndata: [DONE]\n\n`));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe('visual repair fallback', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses a vision-guided full-code candidate when patch anchors fail', async () => {
    const patch = JSON.stringify({ edits: [{ oldText: 'missing exact source', newText: 'none', reason: 'test' }] });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(patch))
      .mockResolvedValueOnce(response('<main>visually fixed</main>'));
    vi.stubGlobal('fetch', fetchMock);

    const converter = new DesignToCode();
    const validation: ValidationResult = {
      similarity: 50, passed: false, regions: [], suggestions: ['fix layout'], screenshots: {},
    };
    const result = await (converter as any).repairWithVision(
      'data:image/png;base64,aGVsbG8=',
      '<main>current</main>',
      validation,
    );

    expect(result.code).toBe('<main>visually fixed</main>');
    expect(result.modelCalls).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await converter.close();
  });
});
