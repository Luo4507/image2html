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
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: prompt,
      },
    ];

    const response = await this.chatCompletion(messages, {
      ...options,
      temperature: options.temperature ?? 0.3, // 代码生成用低温度
    });

    return response.choices[0]?.message?.content || '';
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
