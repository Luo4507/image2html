/**
 * 内网大模型客户端
 */

import type { ModelConfig, ModelRequestTiming } from '../types.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }>;
}

export interface ChatCompletionOptions {
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  onChunk?: (fullText: string) => void;
  onMetrics?: (timing: ModelRequestTiming) => void;
}

export interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finishReason: string;
  }>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * 内网 LLM 客户端（兼容 OpenAI API 格式）
 */
export class InternalLLMClient {
  private baseUrl: string;
  private model: string;
  private apiKey: string;
  private enableThinking?: boolean;

  constructor(config: { baseUrl: string; model: string; apiKey: string; enableThinking?: boolean }) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.model = config.model;
    this.apiKey = config.apiKey;
    this.enableThinking = config.enableThinking;
  }

  /**
   * 发送聊天完成请求
   */
  private readUsage(raw: unknown): ModelRequestTiming['usage'] {
    if (!raw || typeof raw !== 'object') return undefined;
    const value = raw as Record<string, unknown>;
    const promptTokens = Number(value.promptTokens ?? value.prompt_tokens ?? 0);
    const completionTokens = Number(value.completionTokens ?? value.completion_tokens ?? 0);
    const totalTokens = Number(value.totalTokens ?? value.total_tokens ?? promptTokens + completionTokens);
    if (![promptTokens, completionTokens, totalTokens].every(Number.isFinite)) return undefined;
    return { promptTokens, completionTokens, totalTokens };
  }

  async chatCompletion(
    messages: ChatMessage[],
    options: ChatCompletionOptions = {}
  ): Promise<ChatCompletionResponse> {
    const startedAt = Date.now();
    let timeToHeadersMs: number | undefined;
    let outputChars = 0;
    let usage: ModelRequestTiming['usage'];
    let reported = false;
    const report = (success: boolean) => {
      if (reported) return;
      reported = true;
      options.onMetrics?.({
        timeToHeadersMs,
        totalMs: Date.now() - startedAt,
        chunks: 0,
        outputChars,
        usage,
        success,
      });
    };

    try {
      const payload = {
        model: this.model,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 4096,
        ...(this.enableThinking === undefined ? {} : { enable_thinking: this.enableThinking }),
        stream: false,
      };

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });
      timeToHeadersMs = Date.now() - startedAt;

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`LLM API error: ${response.status} - ${error}`);
      }

      const result = await response.json() as ChatCompletionResponse;
      outputChars = result.choices.reduce((total, choice) => total + (choice.message?.content?.length || 0), 0);
      usage = this.readUsage(result.usage);
      report(true);
      return result;
    } catch (error) {
      report(false);
      throw error;
    }
  }

  /**
   * 发送视觉分析请求（带图片）
   */
  async analyzeImage(
    prompt: string,
    imageBase64: string,
    options: ChatCompletionOptions = {}
  ): Promise<string> {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: {
              url: imageBase64.startsWith('data:')
                ? imageBase64
                : `data:image/png;base64,${imageBase64}`,
            },
          },
        ],
      },
    ];

    const response = await this.chatCompletion(messages, options);
    return response.choices[0]?.message?.content || '';
  }

  /**
   * 发送代码生成请求
   */
  async generateCode(
    prompt: string,
    options: ChatCompletionOptions = {}
  ): Promise<string> {
    return this.streamCompletion([{ role: 'user', content: prompt }], options);
  }

  /** Stream code generation from one or more images. */
  async generateWithImages(
    prompt: string,
    imagesBase64: string[],
    options: ChatCompletionOptions = {}
  ): Promise<string> {
    const content: Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }> = [
      { type: 'text', text: prompt },
      ...imagesBase64.map((image) => ({
        type: 'image_url' as const,
        image_url: {
          url: image.startsWith('data:') ? image : `data:image/png;base64,${image}`,
        },
      })),
    ];

    return this.streamCompletion([{ role: 'user', content }], options);
  }

  private async streamCompletion(
    messages: ChatMessage[],
    options: ChatCompletionOptions
  ): Promise<string> {
    const startedAt = Date.now();
    let timeToHeadersMs: number | undefined;
    let timeToFirstContentMs: number | undefined;
    let chunks = 0;
    let result = '';
    let usage: ModelRequestTiming['usage'];
    let reported = false;
    const report = (success: boolean) => {
      if (reported) return;
      reported = true;
      options.onMetrics?.({
        timeToHeadersMs,
        timeToFirstContentMs,
        totalMs: Date.now() - startedAt,
        chunks,
        outputChars: result.length,
        usage,
        success,
      });
    };

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: options.temperature ?? 0.3,
          max_tokens: options.maxTokens ?? 4096,
          ...(this.enableThinking === undefined ? {} : { enable_thinking: this.enableThinking }),
          stream: true,
        }),
      });
      timeToHeadersMs = Date.now() - startedAt;

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`LLM API error: ${response.status} - ${error}`);
      }
      if (!response.body) {
        throw new Error('LLM API returned an empty stream');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;

          const data = trimmed.slice(5).trim();
          if (!data || data === '[DONE]') continue;

          const chunk = JSON.parse(data);
          usage = this.readUsage(chunk.usage) || usage;
          const content = chunk.choices?.[0]?.delta?.content || '';
          if (content) {
            if (timeToFirstContentMs === undefined) timeToFirstContentMs = Date.now() - startedAt;
            chunks += 1;
            result += content;
            options.onChunk?.(result);
          }
        }
      }

      report(true);
      return result;
    } catch (error) {
      report(false);
      throw error;
    }
  }
}

/**
 * 创建视觉模型客户端
 */
export function createVisionClient(config: ModelConfig): InternalLLMClient {
  return new InternalLLMClient(config.visionModel);
}

/**
 * 创建代码模型客户端
 */
export function createCodeClient(config: ModelConfig): InternalLLMClient {
  return new InternalLLMClient(config.codeModel);
}
