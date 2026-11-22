import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignToCode } from '../src/index.js';
import { getDefaultValidationConfig } from '../src/config.js';
import type {
  CodegenOptions,
  GeneratedCode,
  ModelRequestMetrics,
  ValidationResult,
} from '../src/types.js';

const options: CodegenOptions = {
  framework: 'html',
  styleFramework: 'inline',
  componentLibrary: 'none',
  typescript: false,
  responsive: true,
  accessibility: true,
  pipeline: 'direct',
  qualityMode: 'precision',
};

const generated: GeneratedCode = {
  code: '<html><body>current</body></html>',
  filename: 'GeneratedPage.html',
  imports: [],
  components: [],
};

function visualResult(similarity: number, passed: boolean, allViewports = true): ValidationResult {
  return {
    similarity,
    passed,
    regions: [],
    suggestions: [],
    screenshots: {
      desktop: 'desktop',
      tablet: allViewports ? 'tablet' : '',
      mobile: allViewports ? 'mobile' : '',
    },
    quality: {
      overallSimilarity: similarity,
      contentSimilarity: similarity,
      edgeSimilarity: similarity,
      contentRatio: 1,
      qualityScore: similarity,
    },
  };
}

function metric(stage: ModelRequestMetrics['stage']): ModelRequestMetrics {
  return {
    stage,
    model: 'vision',
    stream: true,
    totalMs: 1,
    chunks: 1,
    outputChars: 10,
    success: true,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('conversion performance metrics', () => {
  it('skips extra candidate viewports, captures the final result, and collects model stages', async () => {
    const validationConfig = {
      ...getDefaultValidationConfig(),
      checkTextCoverage: true,
      maxRetryCount: 4,
    };
    const converter = new DesignToCode({ validationConfig });
    vi.spyOn(converter, 'generateDirectCode').mockImplementation(async (
      _image, _options, _progress, _assets, onModelRequest,
    ) => {
      onModelRequest?.(metric('generation'));
      return { ...generated };
    });
    vi.spyOn(converter as any, 'extractVisibleTexts').mockImplementation(async (
      _image: string, onModelRequest?: (value: ModelRequestMetrics) => void,
    ) => {
      onModelRequest?.(metric('text-extraction'));
      return ['current', 'better'];
    });
    vi.spyOn(converter as any, 'repairWithVision').mockImplementation(async (
      _image: string,
      _code: string,
      _validation: ValidationResult,
      _options: CodegenOptions,
      onModelRequest?: (value: ModelRequestMetrics) => void,
    ) => {
      onModelRequest?.(metric('visual-patch'));
      return { code: '<html><body>current better</body></html>', modelCalls: 1 };
    });
    const validate = vi.spyOn(converter, 'validate')
      .mockResolvedValueOnce(visualResult(80, false))
      .mockResolvedValueOnce(visualResult(96, true, false))
      .mockResolvedValueOnce(visualResult(96, true));

    const result = await converter.convert({
      image: { source: 'data:image/png;base64,aGVsbG8=', type: 'base64' },
      options,
      modelConfig: (converter as any).modelConfig,
      validationConfig,
    });

    expect(result.success).toBe(true);
    expect(validate).toHaveBeenCalledTimes(3);
    expect(validate.mock.calls[1][4]).toBe(false);
    expect(validate.mock.calls[2][4]).toBeUndefined();
    expect(result.metrics?.modelRequests?.map((item) => item.stage)).toEqual([
      'generation',
      'text-extraction',
      'visual-patch',
    ]);
    expect(result.validation?.textCoverage).toBe(100);
    await converter.close();
  });
});
