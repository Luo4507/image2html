import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { z } from 'zod';
import { ImageInputError, resolveImageInput } from '../mcp/image-input.js';
import { toolError, type MCPToolResult } from '../mcp/results.js';
import {
  handleAnalyzeStructure,
  handleExtractAssets,
  handleRepairComponent,
  handleValidateDesign,
} from '../mcp/server.js';
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

/** Execute all remote MCP tools through the authenticated in-process service. */
export class JobServiceMCPClient {
  constructor(private readonly options: JobServiceMCPClientOptions) {}

  private async execute(operation: () => Promise<MCPToolResult>): Promise<MCPToolResult> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ImageInputError) return toolError(error.code, error.message);
      if (error instanceof z.ZodError || error instanceof CodegenOptionError) {
        return toolError('INVALID_OPTIONS', error instanceof z.ZodError ? error.issues[0]?.message || '参数无效' : error.message);
      }
      return toolError('REMOTE_REQUEST_FAILED', error instanceof Error ? error.message : String(error));
    }
  }

  private async storeImage(
    args: any,
    pathField: 'image_path' | 'original_image',
    base64Field: 'image_base64' | 'original_image_base64',
  ): Promise<string> {
    const image = await resolveImageInput({
      image_path: args[pathField],
      image_base64: args[base64Field],
      image_filename: args.image_filename,
    });
    const maxBytes = this.options.config.maxUploadMb * 1024 * 1024;
    if (image.data.length > maxBytes) throw new ImageInputError('UPLOAD_TOO_LARGE', `图片不能超过 ${this.options.config.maxUploadMb} MB`);

    const uploadDir = join(this.options.config.dataDir, 'uploads');
    await mkdir(uploadDir, { recursive: true });
    const imagePath = join(uploadDir, `${randomUUID()}${extname(image.filename).toLowerCase()}`);
    await writeFile(imagePath, image.data);
    return imagePath;
  }

  private async withImage(
    args: any,
    pathField: 'image_path' | 'original_image',
    base64Field: 'image_base64' | 'original_image_base64',
    operation: (imagePath: string) => Promise<MCPToolResult>,
  ): Promise<MCPToolResult> {
    const imagePath = await this.storeImage(args, pathField, base64Field);
    try {
      return await operation(imagePath);
    } finally {
      await rm(imagePath, { force: true });
    }
  }

  async generateComponent(args: any = {}, onStatus?: (status: string) => void): Promise<MCPToolResult> {
    if (args.asset_mode === 'extract') {
      return toolError('UNSUPPORTED_REMOTE_OPTION', '生成任务暂不支持 asset_mode=extract，请调用 extract_assets');
    }

    return this.execute(async () => {
      const imagePath = await this.storeImage(args, 'image_path', 'image_base64');
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
    });
  }

  async validateDesign(args: any = {}): Promise<MCPToolResult> {
    return this.execute(() => this.withImage(args, 'original_image', 'original_image_base64', (imagePath) =>
      this.options.service.runWithConverter((converter) =>
        handleValidateDesign(converter, { ...args, original_image: imagePath })),
    ));
  }

  async repairComponent(args: any = {}): Promise<MCPToolResult> {
    return this.execute(() => this.withImage(args, 'original_image', 'original_image_base64', (imagePath) =>
      this.options.service.runWithConverter((converter) =>
        handleRepairComponent(converter, { ...args, original_image: imagePath })),
    ));
  }

  async analyzeStructure(args: any = {}): Promise<MCPToolResult> {
    return this.execute(() => this.withImage(args, 'image_path', 'image_base64', (imagePath) =>
      this.options.service.runWithConverter((converter) =>
        handleAnalyzeStructure(converter, { ...args, image_path: imagePath })),
    ));
  }

  async extractAssets(args: any = {}): Promise<MCPToolResult> {
    return this.execute(() => this.withImage(args, 'image_path', 'image_base64', async (imagePath) => {
      const outputDir = join(this.options.config.dataDir, 'extracted', randomUUID());
      await mkdir(outputDir, { recursive: true });
      try {
        const result = await this.options.service.runWithConverter((converter) =>
          handleExtractAssets(converter, { ...args, image_path: imagePath, output_dir: outputDir }));
        if (result.isError) return result;

        const paths = (result.structuredContent as { paths?: string[] } | undefined)?.paths || [];
        const assets = await Promise.all(paths.map(async (path) => ({
          name: basename(path),
          mimeType: 'image/png',
          data: await readFile(path).then((buffer) => buffer.toString('base64')),
        })));
        return {
          content: [{
            type: 'text',
            text: `✅ 资源提取完成，共 ${assets.length} 个文件\n${assets.map((asset) => `📄 ${asset.name}`).join('\n')}\n图片数据位于 structuredContent.assets，可解码保存到本地项目。`,
          }],
          structuredContent: { success: true, assets },
        };
      } finally {
        await rm(outputDir, { recursive: true, force: true });
      }
    }));
  }
}
