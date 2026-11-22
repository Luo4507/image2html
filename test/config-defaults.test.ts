import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDefaultCodegenOptions, getDefaultValidationConfig } from '../src/config.js';

const QUALITY_ENV_VARS = [
  'MAX_RETRY_COUNT',
  'QUALITY_MODE',
  'CHECK_TEXT_COVERAGE',
  'MIN_TEXT_COVERAGE',
] as const;

let originalEnv: Record<string, string | undefined>;

beforeEach(() => {
  originalEnv = Object.fromEntries(QUALITY_ENV_VARS.map((name) => [name, process.env[name]]));
  for (const name of QUALITY_ENV_VARS) {
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of QUALITY_ENV_VARS) {
    const value = originalEnv[name];
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

describe('quality-first configuration', () => {
  it('defaults to precision, four repairs, and text coverage checks', () => {
    expect(getDefaultCodegenOptions().qualityMode).toBe('precision');
    expect(getDefaultValidationConfig()).toMatchObject({
      maxRetryCount: 4,
      checkTextCoverage: true,
      minTextCoverage: 80,
    });
  });

  it('allows explicit quality overrides', () => {
    process.env.QUALITY_MODE = 'fast';
    process.env.MAX_RETRY_COUNT = '1';
    process.env.CHECK_TEXT_COVERAGE = 'false';
    process.env.MIN_TEXT_COVERAGE = '95';

    expect(getDefaultCodegenOptions().qualityMode).toBe('fast');
    expect(getDefaultValidationConfig()).toMatchObject({
      maxRetryCount: 1,
      checkTextCoverage: false,
      minTextCoverage: 95,
    });
  });
});
