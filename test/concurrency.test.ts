import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from '../src/runtime/concurrency.js';

describe('mapWithConcurrency', () => {
  it('bounds active work and preserves result order', async () => {
    let active = 0;
    let maximum = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 6 - value));
      active -= 1;
      return value * 10;
    });

    expect(maximum).toBe(2);
    expect(result).toEqual([10, 20, 30, 40, 50]);
  });

  it('normalizes invalid limits and handles an empty input', async () => {
    expect(await mapWithConcurrency([], 0, async () => 'unused')).toEqual([]);
    expect(await mapWithConcurrency([1, 2], Number.NaN, async (value) => value + 1)).toEqual([2, 3]);
  });

  it('waits for active work to settle before propagating a failure', async () => {
    const events: string[] = [];
    const pending = mapWithConcurrency([1, 2], 2, async (value) => {
      if (value === 1) throw new Error('broken region');
      await new Promise((resolve) => setTimeout(resolve, 10));
      events.push('finished');
      return value;
    });

    await expect(pending).rejects.toThrow('broken region');
    expect(events).toEqual(['finished']);
  });
});
