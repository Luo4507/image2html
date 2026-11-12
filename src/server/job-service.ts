import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';
import { DesignToCode } from '../index.js';
import { getDefaultModelConfig, getDefaultValidationConfig } from '../config.js';
import type {
  CodegenOptions,
  ConversionProgressEvent,
  DesignToCodeResult,
} from '../types.js';
import type { ServerConfig } from './config.js';
import { JobQueue, type JobRecord } from './job-queue.js';

export interface ConversionArtifacts {
  source: string;
  code: string;
  structure?: string;
  validation?: string;
  qualityHistory?: string;
  rendered?: string;
  diff?: string;
}

export interface ConversionJobResult {
  codeFilename: string;
  similarity?: number;
  passed?: boolean;
  metrics?: DesignToCodeResult['metrics'];
  qualityHistory?: DesignToCodeResult['qualityHistory'];
  artifacts: ConversionArtifacts;
}

interface JobInput {
  userId: string;
  imagePath: string;
  options: CodegenOptions;
  validate: boolean;
  onProgress?: (event: ConversionProgressEvent) => void;
}

export type JobProgressListener = (event: ConversionProgressEvent) => void;

interface Converter {
  convert(request: Parameters<DesignToCode['convert']>[0]): Promise<DesignToCodeResult>;
  close(): Promise<void>;
}

export interface JobServiceOptions {
  config: ServerConfig;
  converterFactory?: () => Converter;
}

const MAX_CACHE_ENTRIES = 32;

export class JobService {
  readonly queue: JobQueue<ConversionJobResult>;
  private readonly inputs = new Map<string, JobInput>();
  private readonly listeners = new Map<string, Set<JobProgressListener>>();
  private readonly events = new Map<string, ConversionProgressEvent[]>();
  private readonly previews = new Map<string, string>();
  private readonly conversionCache = new Map<string, Promise<DesignToCodeResult>>();
  private readonly converterFactory: () => Converter;

  constructor(private readonly options: JobServiceOptions) {
    this.converterFactory = options.converterFactory || (() => new DesignToCode());
    this.queue = new JobQueue<ConversionJobResult>({
      concurrency: options.config.jobConcurrency,
      maxQueueSize: options.config.maxQueueSize,
      processor: (job) => this.process(job),
      onUpdate: (job) => this.persist(job),
    });
  }

  submit(input: JobInput): JobRecord<ConversionJobResult> {
    const job = this.queue.submit({ userId: input.userId });
    input.onProgress = (event) => this.publish(job.id, event);
    this.inputs.set(job.id, input);
    return job;
  }

  get(id: string, userId: string): JobRecord<ConversionJobResult> | undefined {
    return this.queue.get(id, userId);
  }

  get stats() {
    return this.queue.stats;
  }

  subscribe(jobId: string, userId: string, listener: JobProgressListener): (() => void) | undefined {
    if (!this.get(jobId, userId)) return undefined;
    const listeners = this.listeners.get(jobId) || new Set<JobProgressListener>();
    listeners.add(listener);
    this.listeners.set(jobId, listeners);
    for (const event of this.events.get(jobId) || []) listener(event);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(jobId);
    };
  }

  getPreview(jobId: string, userId: string): string | undefined {
    return this.get(jobId, userId) ? this.previews.get(jobId) : undefined;
  }

  getEvents(jobId: string, userId: string): ConversionProgressEvent[] | undefined {
    return this.get(jobId, userId) ? [...(this.events.get(jobId) || [])] : undefined;
  }

  private publish(jobId: string, event: ConversionProgressEvent): void {
    const history = this.events.get(jobId) || [];
    history.push(event);
    if (history.length > 200) history.shift();
    this.events.set(jobId, history);

    if (event.codeSnapshot) this.previews.set(jobId, event.codeSnapshot);
    for (const listener of this.listeners.get(jobId) || []) listener(event);
  }

  async waitForIdle(): Promise<void> {
    await this.queue.waitForIdle();
  }

  async close(): Promise<void> {
    await this.waitForIdle();
    this.listeners.clear();
    this.conversionCache.clear();
  }

  artifactPath(job: JobRecord<ConversionJobResult>, artifact: string): string | undefined {
    const files: Record<string, string> = {
      source: 'source.png',
      code: job.result?.codeFilename || 'component.html',
      structure: 'structure.json',
      validation: 'validation.json',
      'quality-history': 'quality-history.json',
      rendered: 'rendered.png',
      diff: 'diff.png',
    };
    const filename = files[artifact];
    return filename ? join(this.options.config.dataDir, 'jobs', job.id, filename) : undefined;
  }

  private async convertWithCache(
    input: JobInput,
    sourcePath: string
  ): Promise<{ result: DesignToCodeResult; cacheHit: boolean }> {
    const modelConfig = getDefaultModelConfig();
    const validationConfig = input.validate ? getDefaultValidationConfig() : undefined;
    const cacheOptions = Object.fromEntries(
      Object.entries(input.options).sort(([a], [b]) => a.localeCompare(b))
    );
    const cacheKey = createHash('sha256')
      .update(await readFile(sourcePath))
      .update('\0')
      .update(JSON.stringify({
        options: cacheOptions,
        validate: input.validate,
        modelConfig,
        validationConfig,
      }))
      .digest('hex');

    const cached = this.conversionCache.get(cacheKey);
    if (cached) {
      const result = await cached;
      return {
        result: {
          ...result,
          metrics: {
            analysisMs: 0,
            generationMs: 0,
            validationMs: 0,
            repairMs: 0,
            totalMs: 0,
            modelCalls: 0,
            repairIterations: 0,
            cacheHit: true,
          },
        },
        cacheHit: true,
      };
    }

    const conversion = this.runConversion(input, sourcePath, modelConfig, validationConfig);
    this.conversionCache.set(cacheKey, conversion);
    if (this.conversionCache.size > MAX_CACHE_ENTRIES) {
      const oldestKey = this.conversionCache.keys().next().value;
      if (oldestKey) this.conversionCache.delete(oldestKey);
    }

    try {
      return { result: await conversion, cacheHit: false };
    } catch (error) {
      if (this.conversionCache.get(cacheKey) === conversion) {
        this.conversionCache.delete(cacheKey);
      }
      throw error;
    }
  }

  private async runConversion(
    input: JobInput,
    sourcePath: string,
    modelConfig: ReturnType<typeof getDefaultModelConfig>,
    validationConfig: ReturnType<typeof getDefaultValidationConfig> | undefined
  ): Promise<DesignToCodeResult> {
    const converter = this.converterFactory();
    try {
      const result = await converter.convert({
        image: { source: sourcePath, type: 'path' },
        options: input.options,
        modelConfig,
        validationConfig,
        onProgress: input.onProgress,
      });
      if (!result.success) throw new Error(result.error || 'Conversion failed');
      return result;
    } finally {
      await converter.close();
    }
  }

  private async process(job: JobRecord<ConversionJobResult>): Promise<ConversionJobResult> {
    const input = this.inputs.get(job.id);
    if (!input) throw new Error('Job input is missing');

    const jobDir = join(this.options.config.dataDir, 'jobs', job.id);
    await mkdir(jobDir, { recursive: true });
    const sourcePath = join(jobDir, 'source.png');
    await copyFile(input.imagePath, sourcePath);

    try {
      const { result, cacheHit } = await this.convertWithCache(input, sourcePath);
      if (cacheHit) {
        const timestamp = new Date().toISOString();
        input.onProgress?.({
          stage: 'preview',
          message: '已命中转换缓存',
          timestamp,
          codeSnapshot: result.code.code,
        });
        input.onProgress?.({ stage: 'completed', message: '转换完成', timestamp });
      }

      const codeFilename = basename(result.code.filename || 'component.html');
      await writeFile(join(jobDir, codeFilename), result.code.code, 'utf8');
      const artifacts: ConversionArtifacts = {
        source: this.artifactUrl(job.id, 'source'),
        code: this.artifactUrl(job.id, 'code'),
      };

      if (result.structure) {
        await writeFile(
          join(jobDir, 'structure.json'),
          JSON.stringify(result.structure, null, 2),
          'utf8'
        );
        artifacts.structure = this.artifactUrl(job.id, 'structure');
      }

      if (result.validation) {
        const validation = result.validation;
        await writeFile(
          join(jobDir, 'validation.json'),
          JSON.stringify(validation, null, 2),
          'utf8'
        );
        artifacts.validation = this.artifactUrl(job.id, 'validation');

        if (validation.screenshots.desktop) {
          await writeFile(
            join(jobDir, 'rendered.png'),
            Buffer.from(validation.screenshots.desktop, 'base64')
          );
          artifacts.rendered = this.artifactUrl(job.id, 'rendered');
        }
        if (validation.diffImage) {
          await writeFile(
            join(jobDir, 'diff.png'),
            Buffer.from(validation.diffImage, 'base64')
          );
          artifacts.diff = this.artifactUrl(job.id, 'diff');
        }
      }

      if (result.qualityHistory) {
        await writeFile(
          join(jobDir, 'quality-history.json'),
          JSON.stringify(result.qualityHistory, null, 2),
          'utf8'
        );
        artifacts.qualityHistory = this.artifactUrl(job.id, 'quality-history');
      }

      return {
        codeFilename,
        similarity: result.validation?.similarity,
        passed: result.validation?.passed,
        metrics: result.metrics,
        qualityHistory: result.qualityHistory,
        artifacts,
      };
    } finally {
      this.inputs.delete(job.id);
    }
  }

  private artifactUrl(jobId: string, artifact: string): string {
    return `/v1/jobs/${jobId}/artifacts/${artifact}`;
  }

  private async persist(job: JobRecord<ConversionJobResult>): Promise<void> {
    const jobDir = join(this.options.config.dataDir, 'jobs', job.id);
    await mkdir(jobDir, { recursive: true });
    await writeFile(join(jobDir, 'job.json'), JSON.stringify(job, null, 2), 'utf8');
  }
}
