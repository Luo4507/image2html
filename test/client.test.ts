import { afterEach, describe, expect, it, vi } from 'vitest';
import { InternalLLMClient } from '../src/llm/client.js';

describe('InternalLLMClient.generateCode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses streaming and assembles SSE content chunks', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"choices":[{"delta":{"content":"<html>"}}]}\n\n')
        );
        controller.enqueue(
          encoder.encode('data: {"choices":[{"delta":{"content":"ok</html>"}}]}\n\n')
        );
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new InternalLLMClient({
      baseUrl: 'http://model.internal/v1',
      model: 'test-model',
      apiKey: 'test-key',
    });

    const result = await client.generateCode('generate html');

    expect(result).toBe('<html>ok</html>');
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.stream).toBe(true);
  });
});
