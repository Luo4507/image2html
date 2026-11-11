import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { DesignToCode } from '../index.js';
import { getDefaultModelConfig, getDefaultValidationConfig } from '../config.js';
import type {
  CodegenOptions,
  DesignToCodeResult,
} from '../types.js';
import type { ServerConfig } from './config.js';
import { JobQueue, type JobRecord } from './job-queue.js';

export interface ConversionArtifacts {
  source: string;
  code: string;
  structure: string;
  validation?: string;
  rendered?: string;
  diff?: string;
}

export interface ConversionJobResult {
  codeFilename: string;
  similarity?: number;
  passed?: boolean;
  artifacts: ConversionArtifacts;
}

interface JobInput {
  userId: string;
  imagePath: string;
  options: CodegenOptions;
  validate: boolean;
}

interface Converter {
  convert(request: Parameters<DesignToCode['convert']>[0]): Promise<DesignToCodeResult>;
  close(): Promise<void>;
}

export interface JobServiceOptions {
  config: ServerConfig;
  converterFactory?: () => Converter;
}

export class JobService {
  readonly queue: JobQueue<ConversionJobResult>;
  private readonly inputs = new Map<string, JobInput>();
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
    this.inputs.set(job.id, input);
    return job;
  }

  get(id: string, userId: string): JobRecord<ConversionJobResult> | undefined {
    return this.queue.get(id, userId);
  }

  get stats() {
    return this.queue.stats;
  }

  async waitForIdle(): Promise<void> {
    await this.queue.waitForIdle();
  }

  async close(): Promise<void> {
    await this.waitForIdle();
  }

  artifactPath(job: JobRecord<ConversionJobResult>, artifact: string): string | undefined {
    const files: Record<string, string> = {
      source: 'source.png',
      code: job.result?.codeFilename || 'component.html',
      structure: 'structure.json',
      validation: 'validation.json',
      rendered: 'rendered.png',
      diff: 'diff.png',
    };
    const filename = files[artifact];
    return filename ? join(this.options.config.dataDir, 'jobs', job.id, filename) : undefined;
  }

  private async process(job: JobRecord<ConversionJobResult>): Promise<ConversionJobResult> {
    const input = this.inputs.get(job.id);
    if (!input) throw new Error('Job input is missing');

    const jobDir = join(this.options.config.dataDir, 'jobs', job.id);
    await mkdir(jobDir, { recursive: true });
    const sourcePath = join(jobDir, 'source.png');
    await copyFile(input.imagePath, sourcePath);

    const converter = this.converterFactory();
    try {
      const result = await converter.convert({
        image: { source: sourcePath, type: 'path' },
        options: input.options,
        modelConfig: getDefaultModelConfig(),
        validationConfig: input.validate ? getDefaultValidationConfig() : undefined,
      });

      if (!result.success) throw new Error(result.error || 'Conversion failed');

      const codeFilename = basename(result.code.filename || 'component.html');
      await writeFile(join(jobDir, codeFilename), result.code.code, 'utf8');
      await writeFile(
        join(jobDir, 'structure.json'),
        JSON.stringify(result.structure, null, 2),
        'utf8'
      );

      const artifacts: ConversionArtifacts = {
        source: this.artifactUrl(job.id, 'source'),
        code: this.artifactUrl(job.id, 'code'),
        structure: this.artifactUrl(job.id, 'structure'),
      };

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

      return {
        codeFilename,
        similarity: result.validation?.similarity,
        passed: result.validation?.passed,
        artifacts,
      };
    } finally {
      await converter.close();
      await rm(input.imagePath, { force: true });
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
