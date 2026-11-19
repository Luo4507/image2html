import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDefaultModelConfig } from '../src/config.js';

const MODEL_ENV_VARS = [
  'LLM_VL_BASE_URL',
  'LLM_VL_API_KEY',
  'LLM_VL_MODEL',
  'LLM_BASE_URL',
  'LLM_API_KEY',
  'LLM_MODEL',
  'QWEN_VL_BASE_URL',
  'QWEN_VL_API_KEY',
  'VISION_MODEL',
  'GLM_BASE_URL',
  'GLM_API_KEY',
  'CODE_MODEL',
] as const;

let originalEnv: Record<string, string | undefined>;

beforeEach(() => {
  originalEnv = Object.fromEntries(MODEL_ENV_VARS.map((name) => [name, process.env[name]]));
  for (const name of MODEL_ENV_VARS) {
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of MODEL_ENV_VARS) {
    const value = originalEnv[name];
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

describe('model environment configuration', () => {
  it('uses vendor-neutral LLM and LLM_VL variables', () => {
    process.env.LLM_VL_BASE_URL = 'https://vision.example.com/v1';
    process.env.LLM_VL_API_KEY = 'vision-key';
    process.env.LLM_VL_MODEL = 'vision-model';
    process.env.LLM_BASE_URL = 'https://text.example.com/v1';
    process.env.LLM_API_KEY = 'text-key';
    process.env.LLM_MODEL = 'text-model';

    expect(getDefaultModelConfig()).toEqual({
      visionModel: {
        baseUrl: 'https://vision.example.com/v1',
        apiKey: 'vision-key',
        model: 'vision-model',
      },
      codeModel: {
        baseUrl: 'https://text.example.com/v1',
        apiKey: 'text-key',
        model: 'text-model',
      },
    });
  });

  it('keeps legacy model variables as fallbacks', () => {
    process.env.QWEN_VL_BASE_URL = 'https://legacy-vision.example.com/v1';
    process.env.QWEN_VL_API_KEY = 'legacy-vision-key';
    process.env.VISION_MODEL = 'legacy-vision-model';
    process.env.GLM_BASE_URL = 'https://legacy-text.example.com/v1';
    process.env.GLM_API_KEY = 'legacy-text-key';
    process.env.CODE_MODEL = 'legacy-text-model';

    expect(getDefaultModelConfig()).toEqual({
      visionModel: {
        baseUrl: 'https://legacy-vision.example.com/v1',
        apiKey: 'legacy-vision-key',
        model: 'legacy-vision-model',
      },
      codeModel: {
        baseUrl: 'https://legacy-text.example.com/v1',
        apiKey: 'legacy-text-key',
        model: 'legacy-text-model',
      },
    });
  });

  it('prefers generic variables when both naming schemes are present', () => {
    process.env.LLM_VL_BASE_URL = 'https://vision.example.com/v1';
    process.env.LLM_VL_API_KEY = 'vision-key';
    process.env.LLM_VL_MODEL = 'vision-model';
    process.env.LLM_BASE_URL = 'https://text.example.com/v1';
    process.env.LLM_API_KEY = 'text-key';
    process.env.LLM_MODEL = 'text-model';
    process.env.QWEN_VL_BASE_URL = 'https://legacy-vision.example.com/v1';
    process.env.QWEN_VL_API_KEY = 'legacy-vision-key';
    process.env.VISION_MODEL = 'legacy-vision-model';
    process.env.GLM_BASE_URL = 'https://legacy-text.example.com/v1';
    process.env.GLM_API_KEY = 'legacy-text-key';
    process.env.CODE_MODEL = 'legacy-text-model';

    const config = getDefaultModelConfig();
    expect(config.visionModel.baseUrl).toBe('https://vision.example.com/v1');
    expect(config.visionModel.apiKey).toBe('vision-key');
    expect(config.visionModel.model).toBe('vision-model');
    expect(config.codeModel.baseUrl).toBe('https://text.example.com/v1');
    expect(config.codeModel.apiKey).toBe('text-key');
    expect(config.codeModel.model).toBe('text-model');
  });
});
