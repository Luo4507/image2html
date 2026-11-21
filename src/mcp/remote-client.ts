import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type { ConversionProgressEvent } from '../types.js';
import { toolError, type MCPToolResult } from './results.js';

export interface RemoteMCPConfig {
  baseUrl: string;
  apiKey: string;
  pollIntervalMs: number;
  timeoutMs: number;
}

export interface RemoteMCPClientOptions extends Partial<RemoteMCPConfig> {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

interface JobResponse {
  job?: {
    id?: string;
    status?: 'queued' | 'running' | 'succeeded' | 'failed';
    error?: string;
    result?: {
      codeFilename?: string;
      imports?: string[];
      components?: string[];
      validation?: Record<string, unknown>;
      metrics?: Record<string, unknown>;
      artifacts?: { code?: string };
    };
  };
}

class RemoteAPIError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'RemoteAPIError';
  }
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

export function getRemoteMCPConfig(env: NodeJS.ProcessEnv = process.env): RemoteMCPConfig {
  const baseUrl = env.IMAGE2HTML_URL?.trim().replace(/\/+$/, '');
  const apiKey = env.IMAGE2HTML_API_KEY?.trim();
  if (!baseUrl) throw new Error('IMAGE2HTML_URL is required for the remote MCP adapter');
  if (!apiKey) throw new Error('IMAGE2HTML_API_KEY is required for the remote MCP adapter');
  const url = new URL(baseUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('IMAGE2HTML_URL must use http or https');
  }
  return {
    baseUrl,
    apiKey,
    pollIntervalMs: positiveInteger(env.IMAGE2HTML_POLL_INTERVAL_MS, 1000),
    timeoutMs: positiveInteger(env.IMAGE2HTML_TIMEOUT_MS, 600000),
  };
}

function mimeType(path: string): string | undefined {
  return {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
  }[extname(path).toLowerCase()];
}

function delay(milliseconds: number): Promise<void> {
  return milliseconds > 0
    ? new Promise((resolve) => setTimeout(resolve, milliseconds))
    : Promise.resolve();
}

/** Local stdio adapter for the authenticated, queued company HTTP service. */
export class RemoteMCPClient {
  readonly #baseUrl: string;
  readonly #apiKey: string;
  readonly #pollIntervalMs: number;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(options: RemoteMCPClientOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.#apiKey = options.apiKey;
    this.#pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.#timeoutMs = options.timeoutMs ?? 600000;
    this.#fetch = options.fetchImpl || fetch;
  }

  private safeMessage(message: string): string {
    return message.split(this.#apiKey).join('[redacted]');
  }

  private async request(path: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
    const response = await this.#fetch(`${this.#baseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.#apiKey}`, ...init.headers },
      signal,
    });
    if (response.ok) return response;

    let message = `HTTP ${response.status}`;
    try {
      const body = await response.json() as { message?: string; error?: string };
      message = body.message || body.error || message;
    } catch {
      // Keep the status-based message when the server did not return JSON.
    }
    throw new RemoteAPIError(response.status, this.safeMessage(message));
  }

  private async json(path: string, init: RequestInit, signal: AbortSignal): Promise<JobResponse> {
    const response = await this.request(path, init, signal);
    return await response.json() as JobResponse;
  }

  async generateComponent(
    args: any = {},
    onStatus?: (status: string) => void,
  ): Promise<MCPToolResult> {
    const imagePath = args.image_path;
    if (!imagePath || !existsSync(imagePath)) {
      return toolError('FILE_NOT_FOUND', `文件不存在: ${String(imagePath)}`);
    }
    if (args.asset_mode === 'extract') {
      return toolError('UNSUPPORTED_REMOTE_OPTION', '远程生成适配器暂不支持 asset_mode=extract，请使用本地 MCP 提取资源');
    }
    const type = mimeType(imagePath);
    if (!type) return toolError('INVALID_IMAGE_TYPE', '远程生成仅支持 PNG、JPG、JPEG、WebP 图片');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    timer.unref();

    try {
      const image = await readFile(imagePath);
      const form = new FormData();
      form.append('image', new File([new Uint8Array(image)], basename(imagePath), { type }));
      const framework = args.framework || 'react';
      const componentLibrary = args.component_library || (
        framework === 'vue' ? 'element' : framework === 'html' ? 'none' : 'antd'
      );
      const fields = {
        framework,
        styleFramework: args.style_framework || 'tailwind',
        componentLibrary,
        typescript: args.typescript ?? true,
        responsive: args.responsive ?? true,
        accessibility: true,
        pipeline: args.pipeline || 'direct',
        qualityMode: args.quality_mode || 'balanced',
        layoutMode: args.layout_mode || 'single',
        assetMode: 'none',
        validate: true,
      };
      for (const [name, value] of Object.entries(fields)) form.append(name, String(value));

      const created = await this.json('/v1/jobs', { method: 'POST', body: form }, controller.signal);
      const jobId = created.job?.id;
      if (!jobId) return toolError('REMOTE_PROTOCOL_ERROR', '集中服务未返回任务 ID');
      onStatus?.('queued');

      let job: JobResponse['job'];
      while (true) {
        const current = await this.json(`/v1/jobs/${encodeURIComponent(jobId)}`, {}, controller.signal);
        job = current.job;
        if (!job) return toolError('REMOTE_PROTOCOL_ERROR', '集中服务未返回任务状态');
        if (job.status === 'succeeded') break;
        if (job.status === 'failed') {
          return toolError('GENERATION_FAILED', this.safeMessage(job.error || '远程代码生成失败'));
        }
        if (job.status !== 'queued' && job.status !== 'running') {
          return toolError('REMOTE_PROTOCOL_ERROR', `未知任务状态: ${String(job.status)}`);
        }
        onStatus?.(job.status);
        await delay(this.#pollIntervalMs);
        if (controller.signal.aborted) throw controller.signal.reason;
      }

      onStatus?.('completed');
      const result = job.result;
      const artifact = result?.artifacts?.code;
      if (!result || !artifact) return toolError('REMOTE_PROTOCOL_ERROR', '任务完成但缺少源码产物');
      const codeResponse = await this.request(artifact, {}, controller.signal);
      const code = await codeResponse.text();
      const structuredContent = {
        success: true,
        code,
        filename: result.codeFilename || 'component.html',
        imports: result.imports || [],
        components: result.components || [],
        validation: result.validation,
        metrics: result.metrics,
      };
      const validation = result.validation;
      const summary = validation
        ? `📊 视觉校验: ${String(validation.similarity)}% ${validation.passed ? '✅ 通过' : '❌ 未通过'}\n\n`
        : '';
      return {
        content: [{
          type: 'text',
          text: `${summary}✅ 远程代码生成成功！\n📄 文件名: ${structuredContent.filename}\n\n${code}`,
        }],
        structuredContent,
      };
    } catch (error) {
      if (controller.signal.aborted) {
        return toolError('REMOTE_TIMEOUT', `远程生成超过 ${this.#timeoutMs}ms，已停止等待`);
      }
      if (error instanceof RemoteAPIError) {
        const code = error.status === 401 || error.status === 403
          ? 'REMOTE_UNAUTHORIZED'
          : error.status === 429
            ? 'REMOTE_RATE_LIMITED'
            : 'REMOTE_HTTP_ERROR';
        return toolError(code, `集中服务请求失败（HTTP ${error.status}）: ${error.message}`);
      }
      return toolError('REMOTE_REQUEST_FAILED', this.safeMessage(error instanceof Error ? error.message : String(error)));
    } finally {
      clearTimeout(timer);
    }
  }
}

export type RemoteProgressHandler = (event: ConversionProgressEvent) => void;
