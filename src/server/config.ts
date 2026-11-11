import { resolve } from 'node:path';

export interface ServerConfig {
  host: string;
  port: number;
  dataDir: string;
  apiKeys: Map<string, string>;
  maxUploadMb: number;
  jobConcurrency: number;
  maxQueueSize: number;
  rateLimitPerMinute: number;
}

export function parseApiKeys(value = ''): Map<string, string> {
  const entries = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const separator = item.indexOf(':');
      if (separator < 1 || separator === item.length - 1) {
        throw new Error('API_KEYS entries must use the format user-id:secret');
      }
      return [item.slice(separator + 1), item.slice(0, separator)] as const;
    });

  return new Map(entries);
}

export function getServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const apiKeys = parseApiKeys(env.API_KEYS);
  if (apiKeys.size === 0) {
    throw new Error('API_KEYS is required, for example: API_KEYS=alice:replace-with-a-long-secret');
  }

  return {
    host: env.HOST || '0.0.0.0',
    port: Number(env.PORT || 3000),
    dataDir: resolve(env.DATA_DIR || 'data'),
    apiKeys,
    maxUploadMb: Number(env.MAX_UPLOAD_MB || 10),
    jobConcurrency: Number(env.JOB_CONCURRENCY || 2),
    maxQueueSize: Number(env.MAX_QUEUE_SIZE || 100),
    rateLimitPerMinute: Number(env.RATE_LIMIT_PER_MINUTE || 60),
  };
}
