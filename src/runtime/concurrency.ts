/** Map with bounded parallelism while preserving input order. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.min(items.length, Math.max(1, Math.floor(concurrency) || 1));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  };
  const workers = await Promise.allSettled(Array.from({ length: limit }, () => worker()));
  const failed = workers.find((worker): worker is PromiseRejectedResult => worker.status === 'rejected');
  if (failed) throw failed.reason;
  return results;
}
