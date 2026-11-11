import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import express, {
  type ErrorRequestHandler,
  type Express,
  type Request,
  type Response,
} from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { z } from 'zod';
import { getDefaultCodegenOptions } from '../config.js';
import { JobService, type JobServiceOptions } from './job-service.js';
import type { JobRecord } from './job-queue.js';
import type { ConversionJobResult } from './job-service.js';

interface AuthenticatedRequest extends Request {
  userId?: string;
}

const optionSchema = z.object({
  framework: z.enum(['react', 'vue', 'html']).optional(),
  styleFramework: z.enum(['tailwind', 'scss', 'css-modules', 'inline']).optional(),
  componentLibrary: z.enum(['antd', 'element', 'none']).optional(),
  typescript: z.boolean().optional(),
  responsive: z.boolean().optional(),
  accessibility: z.boolean().optional(),
});

function publicJob(job: JobRecord<ConversionJobResult>) {
  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    error: job.error,
    result: job.result,
  };
}

function booleanField(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  return value === true || value === 'true';
}

export async function createServerApp(options: {
  config: JobServiceOptions['config'];
  converterFactory?: JobServiceOptions['converterFactory'];
}): Promise<{ app: Express; service: JobService }> {
  const { config } = options;
  await mkdir(join(config.dataDir, 'uploads'), { recursive: true });
  await mkdir(join(config.dataDir, 'jobs'), { recursive: true });

  const service = new JobService({
    config,
    converterFactory: options.converterFactory,
  });
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));

  app.get('/', (_req, res) => {
    res.json({ name: 'image2html', version: '0.1.0', status: 'ok' });
  });
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', queue: service.stats });
  });
  app.get('/ready', (_req, res) => {
    res.json({ status: 'ready' });
  });

  app.use('/v1', (req: AuthenticatedRequest, res, next) => {
    const authorization = req.get('authorization') || '';
    const key = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    const userId = config.apiKeys.get(key);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', message: 'A valid API key is required' });
      return;
    }
    req.userId = userId;
    next();
  });

  const windows = new Map<string, { count: number; resetAt: number }>();
  app.use('/v1', (req: AuthenticatedRequest, res, next) => {
    const now = Date.now();
    const key = req.userId || req.ip || 'unknown';
    const current = windows.get(key);
    if (!current || current.resetAt <= now) {
      windows.set(key, { count: 1, resetAt: now + 60_000 });
      next();
      return;
    }
    current.count += 1;
    if (current.count > config.rateLimitPerMinute) {
      res.set('Retry-After', String(Math.ceil((current.resetAt - now) / 1000)));
      res.status(429).json({ error: 'TooManyRequests', message: 'Rate limit exceeded' });
      return;
    }
    next();
  });

  const upload = multer({
    dest: join(config.dataDir, 'uploads'),
    limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, callback) => {
      const allowed = ['image/png', 'image/jpeg', 'image/webp'];
      callback(null, allowed.includes(file.mimetype));
    },
  });

  app.post('/v1/jobs', upload.single('image'), async (req: AuthenticatedRequest, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'BadRequest', message: 'An image file is required' });
      return;
    }

    try {
      const parsed = optionSchema.parse({
        framework: req.body.framework,
        styleFramework: req.body.styleFramework,
        componentLibrary: req.body.componentLibrary,
        typescript: booleanField(req.body.typescript),
        responsive: booleanField(req.body.responsive),
        accessibility: booleanField(req.body.accessibility),
      });
      const job = service.submit({
        userId: req.userId!,
        imagePath: req.file.path,
        options: { ...getDefaultCodegenOptions(), ...parsed },
        validate: booleanField(req.body.validate) !== false,
      });
      res.status(202).json({ job: publicJob(job) });
    } catch (error) {
      await rm(req.file.path, { force: true });
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'BadRequest', message: error.issues[0]?.message });
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      res.status(message === 'Job queue is full' ? 503 : 500).json({
        error: 'JobSubmissionFailed',
        message,
      });
    }
  });

  app.get('/v1/jobs/:id', (req: AuthenticatedRequest, res) => {
    const job = service.get(String(req.params.id), req.userId!);
    if (!job) {
      res.status(404).json({ error: 'NotFound', message: 'Job not found' });
      return;
    }
    res.json({ job: publicJob(job) });
  });

  app.get(
    '/v1/jobs/:id/artifacts/:artifact',
    (req: AuthenticatedRequest, res: Response, next) => {
      const job = service.get(String(req.params.id), req.userId!);
      const path = job && service.artifactPath(job, String(req.params.artifact));
      if (!job || !path || job.status !== 'succeeded') {
        res.status(404).json({ error: 'NotFound', message: 'Artifact not found' });
        return;
      }
      res.sendFile(path, (error) => {
        if (error) next(error);
      });
    }
  );

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (res.headersSent) return;
    if (error instanceof multer.MulterError) {
      res.status(400).json({ error: error.code, message: error.message });
      return;
    }
    if (error?.code === 'ENOENT') {
      res.status(404).json({ error: 'NotFound', message: 'Artifact not found' });
      return;
    }
    console.error('[server] request failed', error);
    res.status(500).json({ error: 'InternalServerError', message: 'Internal server error' });
  };
  app.use(errorHandler);

  return { app, service };
}
