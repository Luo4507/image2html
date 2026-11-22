import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { z } from 'zod';
import { ImageInputError, resolveImageInput } from '../mcp/image-input.js';
import { toolError, type MCPToolResult } from '../mcp/results.js';
import { CodegenOptionError } from '../runtime/codegen-options.js';
import type { ServerConfig } from './config.js';
import { resolveJobOptions } from './job-options.js';
import type { JobService } from './job-service.js';

interface JobServiceMCPClientOptions {
  service: JobService;
  config: ServerConfig;
  userId: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Execute remote MCP generation through the authenticated in-process job queue. */
export class JobServiceMCPClient {
  constructor(private readonly options: JobServiceMCPClientOptions) {}

  async generateComponent(args: any = {}, onStatus?: (status: string) => void): Promise<MCPToolResult> {
    if (args.asset_mode === 'extract') {
      return toolError('UNSUPPORTED_REMOTE_OPTION', '远程 MCP 暂不支持 asset_mode=extract');
    }

    try {
      const image = await resolveImageInput(args);
      const maxBytes = this.options.config.maxUploadMb * 1024 * 1024;
      if (image.data.length > maxBytes) {
        return toolError('UPLOAD_TOO_LARGE', `图片不能超过 ${this.options.config.maxUploadMb} MB`);
      }

      const codegenOptions = resolveJobOptions({
        framework: args.framework,
        styleFramework: args.style_framework,
        componentLibrary: args.component_library,
        typescript: args.typescript,
        responsive: args.responsive,
        accessibility: args.accessibility ?? true,
        pipeline: args.pipeline,
        qualityMode: args.quality_mode,
        layoutMode: args.layout_mode,
        assetMode: 'none',
      });
      const uploadDir = join(this.options.config.dataDir, 'uploads');
      await mkdir(uploadDir, { recursive: true });
      const imagePath = join(uploadDir, `${randomUUID()}${extname(image.filename).toLowerCase()}`);
      await writeFile(imagePath, image.data);

      const { service, userId } = this.options;
      const submitted = service.submit({
        userId,
        imagePath,
        options: codegenOptions,
        validate: true,
      });
      let lastStatus = '';
      const deadline = Date.now() + (this.options.timeoutMs ?? 600_000);

      while (Date.now() <= deadline) {
        const current = service.get(submitted.id, userId);
        if (!current) return toolError('REMOTE_PROTOCOL_ERROR', '集中服务未返回任务状态');
        if (current.status !== lastStatus) {
          lastStatus = current.status;
          onStatus?.(current.status);
        }

        if (current.status === 'succeeded') {
          const result = current.result;
          const codePath = service.artifactPath(current, 'code');
          if (!result || !codePath) return toolError('REMOTE_PROTOCOL_ERROR', '任务完成但缺少源码产物');
          const code = await readFile(codePath, 'utf8');
          const structuredContent = {
            success: true,
            code,
            filename: result.codeFilename,
            imports: result.imports,
            components: result.components,
            validation: result.validation,
            metrics: result.metrics,
          };
          const summary = result.validation
            ? `📊 视觉校验: ${String(result.validation.similarity)}% ${result.validation.passed ? '✅ 通过' : '❌ 未通过'}\n\n`
            : '';
          return {
            content: [{
              type: 'text',
              text: `${summary}✅ 远程代码生成成功！\n📄 文件名: ${structuredContent.filename}\n\n${code}`,
            }],
            structuredContent,
          };
        }
        if (current.status === 'failed') {
          return toolError('GENERATION_FAILED', current.error || '远程代码生成失败');
        }
        if (current.status !== 'queued' && current.status !== 'running') {
          return toolError('REMOTE_PROTOCOL_ERROR', `未知任务状态: ${String(current.status)}`);
        }
        await delay(this.options.pollIntervalMs ?? 100);
      }
      return toolError('REMOTE_TIMEOUT', '远程生成等待超时；任务可能仍在服务端继续执行');
    } catch (error) {
      if (error instanceof ImageInputError) return toolError(error.code, error.message);
      if (error instanceof z.ZodError || error instanceof CodegenOptionError) {
        return toolError('INVALID_OPTIONS', error instanceof z.ZodError ? error.issues[0]?.message || '参数无效' : error.message);
      }
      return toolError('REMOTE_REQUEST_FAILED', error instanceof Error ? error.message : String(error));
    }
  }
}
