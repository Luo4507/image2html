/**
 * 内网大模型客户端
 */

import type { ModelConfig } from '../types.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }>;
}

export interface ChatCompletionOptions {
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  onChunk?: (fullText: string) => void;
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

  constructor(config: { baseUrl: string; model: string; apiKey: string }) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.model = config.model;
    this.apiKey = config.apiKey;
  }

  /**
   * 发送聊天完成请求
   */
  async chatCompletion(
    messages: ChatMessage[],
    options: ChatCompletionOptions = {}
  ): Promise<ChatCompletionResponse> {
    const payload = {
      model: this.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
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

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LLM API error: ${response.status} - ${error}`);
    }

    return response.json();
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
        stream: true,
      }),
    });

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
    let result = '';

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
        const content = chunk.choices?.[0]?.delta?.content || '';
        if (content) {
          result += content;
          options.onChunk?.(result);
        }
      }
    }

    return result;
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
