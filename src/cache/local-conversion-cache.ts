import { createHash, randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import type { DesignToCodeRequest, DesignToCodeResult } from '../types.js';

export const LOCAL_CONVERSION_CACHE_VERSION = '2026-11-22.1';
const MAX_CACHE_ENTRIES = 32;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableValue(item)])
    );
  }
  return value;
}

export function createLocalConversionCacheKey(
  image: Buffer,
  request: DesignToCodeRequest
): string {
  return createHash('sha256')
    .update(image)
    .update('\0')
    .update(JSON.stringify(stableValue({
      version: LOCAL_CONVERSION_CACHE_VERSION,
      options: request.options,
      modelConfig: request.modelConfig,
      validationConfig: request.validationConfig,
    })))
    .digest('hex');
}

async function imageBytes(request: DesignToCodeRequest): Promise<Buffer> {
  if (request.image.type === 'path') return readFile(request.image.source);
  return Buffer.from(request.image.source.replace(/^data:image\/\w+;base64,/, ''), 'base64');
}

function cacheHitResult(result: DesignToCodeResult): DesignToCodeResult {
  return {
    ...result,
    metrics: {
      analysisMs: 0,
      generationMs: 0,
      validationMs: 0,
      repairMs: 0,
      totalMs: 0,
      modelCalls: 0,
      repairIterations: 0,
      modelRequests: [],
      cacheHit: true,
    },
  };
}

/** Opt-in local disk cache. Only successful, quality-passing conversions are stored. */
export class LocalConversionCache {
  constructor(readonly directory: string) {}

  private path(key: string): string {
    return join(this.directory, `${key}.json`);
  }

  async read(key: string): Promise<DesignToCodeResult | undefined> {
    try {
      const result = JSON.parse(await readFile(this.path(key), 'utf8')) as DesignToCodeResult;
      if (!result.success || !result.code?.code || result.validation?.passed === false) return undefined;
      return result;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[design-to-code] Ignoring invalid local conversion cache', error);
      }
      return undefined;
    }
  }

  async write(key: string, result: DesignToCodeResult): Promise<void> {
    if (!result.success || !result.code?.code || result.validation?.passed === false) return;
    await mkdir(this.directory, { recursive: true });
    const temporary = join(this.directory, `.${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(result), 'utf8');
    await rename(temporary, this.path(key));
    await this.prune();
  }

  private async prune(): Promise<void> {
    const entries = (await readdir(this.directory))
      .filter((name) => /^[a-f0-9]{64}\.json$/.test(name));
    if (entries.length <= MAX_CACHE_ENTRIES) return;
    const dated = await Promise.all(entries.map(async (name) => ({
      name,
      modifiedAt: (await stat(join(this.directory, name))).mtimeMs,
    })));
    dated.sort((a, b) => a.modifiedAt - b.modifiedAt);
    await Promise.all(
      dated.slice(0, dated.length - MAX_CACHE_ENTRIES)
        .map((entry) => rm(join(this.directory, entry.name), { force: true }))
    );
  }
}

export async function withLocalConversionCache(
  request: DesignToCodeRequest,
  cache: LocalConversionCache,
  convert: () => Promise<DesignToCodeResult>
): Promise<DesignToCodeResult> {
  const key = createLocalConversionCacheKey(await imageBytes(request), request);
  const cached = await cache.read(key);
  if (cached) {
    const result = cacheHitResult(cached);
    const timestamp = new Date().toISOString();
    request.onProgress?.({
      stage: 'preview',
      message: '已命中本地转换缓存',
      timestamp,
      chars: result.code.code.length,
      codeSnapshot: result.code.code,
    });
    request.onProgress?.({ stage: 'completed', message: '已复用本地转换结果', timestamp });
    return result;
  }

  const result = await convert();
  try {
    await cache.write(key, result);
  } catch (error) {
    console.warn('[design-to-code] Unable to write local conversion cache', error);
  }
  return result;
}
