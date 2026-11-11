import { describe, expect, it } from 'vitest';
import { JobQueue } from '../src/server/job-queue.js';

describe('JobQueue', () => {
  it('never exceeds the configured concurrency', async () => {
    let active = 0;
    let maxActive = 0;
    const queue = new JobQueue({
      concurrency: 1,
      maxQueueSize: 10,
      processor: async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 20));
        active -= 1;
      },
    });

    queue.submit({ userId: 'alice' });
    queue.submit({ userId: 'bob' });
    await queue.waitForIdle();

    expect(maxActive).toBe(1);
    expect(queue.stats.succeeded).toBe(2);
  });

  it('records failures and releases the worker slot', async () => {
    const queue = new JobQueue({
      concurrency: 1,
      maxQueueSize: 10,
      processor: async (job) => {
        if (job.userId === 'alice') throw new Error('conversion failed');
      },
    });

    const failed = queue.submit({ userId: 'alice' });
    const succeeded = queue.submit({ userId: 'bob' });
    await queue.waitForIdle();

    expect(queue.get(failed.id, 'alice')?.status).toBe('failed');
    expect(queue.get(failed.id, 'alice')?.error).toBe('conversion failed');
    expect(queue.get(succeeded.id, 'bob')?.status).toBe('succeeded');
  });
});
