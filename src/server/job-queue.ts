import { randomUUID } from 'node:crypto';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface JobRecord<TResult = unknown> {
  id: string;
  userId: string;
  status: JobStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  result?: TResult;
}

export interface JobQueueOptions<TResult> {
  concurrency: number;
  maxQueueSize: number;
  processor: (job: JobRecord<TResult>) => Promise<TResult | void>;
  onUpdate?: (job: JobRecord<TResult>) => void | Promise<void>;
}

/** A bounded, single-process queue for model and browser work. */
export class JobQueue<TResult = unknown> {
  private readonly jobs = new Map<string, JobRecord<TResult>>();
  private readonly waiting: Array<JobRecord<TResult>> = [];
  private readonly idleWaiters = new Set<() => void>();
  private active = 0;
  private succeeded = 0;
  private failed = 0;

  constructor(private readonly options: JobQueueOptions<TResult>) {
    if (options.concurrency < 1) throw new Error('concurrency must be at least 1');
  }

  submit({ userId }: { userId: string }): JobRecord<TResult> {
    if (this.waiting.length >= this.options.maxQueueSize) {
      throw new Error('Job queue is full');
    }

    const job: JobRecord<TResult> = {
      id: randomUUID(),
      userId,
      status: 'queued',
      createdAt: new Date().toISOString(),
    };
    this.jobs.set(job.id, job);
    this.waiting.push(job);
    queueMicrotask(() => void this.pump());
    return job;
  }

  get(id: string, userId: string): JobRecord<TResult> | undefined {
    const job = this.jobs.get(id);
    return job?.userId === userId ? job : undefined;
  }

  get stats() {
    return {
      active: this.active,
      queued: this.waiting.length,
      succeeded: this.succeeded,
      failed: this.failed,
    };
  }

  async waitForIdle(): Promise<void> {
    if (this.active === 0 && this.waiting.length === 0) return;
    await new Promise<void>((resolve) => this.idleWaiters.add(resolve));
  }

  private async pump(): Promise<void> {
    while (this.active < this.options.concurrency && this.waiting.length > 0) {
      const job = this.waiting.shift()!;
      this.active += 1;
      job.status = 'running';
      job.startedAt = new Date().toISOString();
      await this.options.onUpdate?.(job);

      void this.options
        .processor(job)
        .then((result) => {
          if (result !== undefined) job.result = result;
          job.status = 'succeeded';
          this.succeeded += 1;
        })
        .catch((error: unknown) => {
          job.status = 'failed';
          job.error = error instanceof Error ? error.message : String(error);
          this.failed += 1;
        })
        .finally(async () => {
          job.completedAt = new Date().toISOString();
          this.active -= 1;
          await this.options.onUpdate?.(job);
          if (this.active === 0 && this.waiting.length === 0) {
            for (const resolve of this.idleWaiters) resolve();
            this.idleWaiters.clear();
          }
          void this.pump();
        });
    }
  }
}
