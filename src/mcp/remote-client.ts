import type { ConversionProgressEvent } from '../types.js';
import { ImageInputError, resolveImageInput } from './image-input.js';
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

function delay(milliseconds: number): Promise<void> {
  return milliseconds > 0
    ? new Promise((resolve) => setTimeout(resolve, milliseconds))
    : Promise.resolve();
}

/** Local stdio adapter for the authenticated company HTTP service. */
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

  private async json<T = JobResponse>(path: string, init: RequestInit, signal: AbortSignal): Promise<T> {
    const response = await this.request(path, init, signal);
    return await response.json() as T;
  }

  private mapError(error: unknown, aborted: boolean, action: string): MCPToolResult {
    if (aborted) {
      return toolError('REMOTE_TIMEOUT', `${action}超过 ${this.#timeoutMs}ms，已停止等待`);
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
  }

  private async callTool(
    path: string,
    args: any,
    pathField: 'image_path' | 'original_image',
    base64Field: 'image_base64' | 'original_image_base64',
  ): Promise<MCPToolResult> {
    let image: Awaited<ReturnType<typeof resolveImageInput>>;
    try {
      image = await resolveImageInput({
        image_path: args[pathField],
        image_base64: args[base64Field],
        image_filename: args.image_filename,
      });
    } catch (error) {
      if (error instanceof ImageInputError) return toolError(error.code, error.message);
      throw error;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    timer.unref();
    try {
      const payload = { ...args };
      delete payload[pathField];
      delete payload.output_dir;
      payload[base64Field] = `data:${image.type};base64,${image.data.toString('base64')}`;
      payload.image_filename = image.filename;
      return await this.json<MCPToolResult>(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, controller.signal);
    } catch (error) {
      return this.mapError(error, controller.signal.aborted, '远程工具调用');
    } finally {
      clearTimeout(timer);
    }
  }

  async generateComponent(
    args: any = {},
    onStatus?: (status: string) => void,
  ): Promise<MCPToolResult> {
    if (args.asset_mode === 'extract') {
      return toolError('UNSUPPORTED_REMOTE_OPTION', '生成任务暂不支持 asset_mode=extract，请调用 extract_assets');
    }
    let image: Awaited<ReturnType<typeof resolveImageInput>>;
    try {
      image = await resolveImageInput(args);
    } catch (error) {
      if (error instanceof ImageInputError) return toolError(error.code, error.message);
      throw error;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    timer.unref();

    try {
      const form = new FormData();
      form.append('image', new File([new Uint8Array(image.data)], image.filename, { type: image.type }));
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
        qualityMode: args.quality_mode || 'precision',
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
      return this.mapError(error, controller.signal.aborted, '远程生成');
    } finally {
      clearTimeout(timer);
    }
  }

  async validateDesign(args: any = {}): Promise<MCPToolResult> {
    return this.callTool('/v1/tools/validate', args, 'original_image', 'original_image_base64');
  }

  async repairComponent(args: any = {}): Promise<MCPToolResult> {
    return this.callTool('/v1/tools/repair', args, 'original_image', 'original_image_base64');
  }

  async analyzeStructure(args: any = {}): Promise<MCPToolResult> {
    return this.callTool('/v1/tools/analyze', args, 'image_path', 'image_base64');
  }

  async extractAssets(args: any = {}): Promise<MCPToolResult> {
    return this.callTool('/v1/tools/extract', args, 'image_path', 'image_base64');
  }
}

export type RemoteProgressHandler = (event: ConversionProgressEvent) => void;
