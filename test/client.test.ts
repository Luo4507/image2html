import { afterEach, describe, expect, it, vi } from 'vitest';
import { InternalLLMClient } from '../src/llm/client.js';

describe('InternalLLMClient.generateCode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses streaming and assembles SSE content chunks with request metrics', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"choices":[{"delta":{"content":"<html>"}}]}\n\n')
        );
        controller.enqueue(
          encoder.encode('data: {"choices":[{"delta":{"content":"ok</html>"}}]}\n\n')
        );
        controller.enqueue(
          encoder.encode('data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":8,"total_tokens":20}}\n\n')
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

    const onMetrics = vi.fn();
    const result = await client.generateCode('generate html', { onMetrics });

    expect(result).toBe('<html>ok</html>');
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.stream).toBe(true);
    expect(request).not.toHaveProperty('enable_thinking');
    expect(onMetrics).toHaveBeenCalledTimes(1);
    const timing = onMetrics.mock.calls[0][0];
    expect(timing).toMatchObject({
      chunks: 2,
      outputChars: 15,
      success: true,
      usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 },
    });
    expect(timing.timeToHeadersMs).toBeGreaterThanOrEqual(0);
    expect(timing.timeToFirstContentMs).toBeGreaterThanOrEqual(0);
    expect(timing.totalMs).toBeGreaterThanOrEqual(timing.timeToFirstContentMs);
  });

  it('reports non-streaming response timing and normalized usage', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      choices: [{ message: { role: 'assistant', content: 'ok' }, finishReason: 'stop' }],
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new InternalLLMClient({
      baseUrl: 'http://model.internal/v1',
      model: 'test-model',
      apiKey: 'test-key',
    });
    const onMetrics = vi.fn();

    const response = await client.chatCompletion([{ role: 'user', content: 'test' }], { onMetrics });

    expect(response.choices[0].message.content).toBe('ok');
    expect(onMetrics.mock.calls[0][0]).toMatchObject({
      chunks: 0,
      outputChars: 2,
      success: true,
      usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 },
    });
  });

  it('streams multimodal image generation requests', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"choices":[{"delta":{"content":"<div>image</div>"}}]}\n\n')
        );
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new InternalLLMClient({
      baseUrl: 'http://model.internal/v1',
      model: 'vision-model',
      apiKey: 'test-key',
      enableThinking: false,
    });

    const onChunk = vi.fn();
    const result = await client.generateWithImages(
      'generate',
      ['data:image/png;base64,abc'],
      { onChunk }
    );

    expect(result).toBe('<div>image</div>');
    expect(onChunk).toHaveBeenCalledWith('<div>image</div>');
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.stream).toBe(true);
    expect(request.enable_thinking).toBe(false);
    expect(request.messages[0].content[1].image_url.url).toBe('data:image/png;base64,abc');
  });
});
