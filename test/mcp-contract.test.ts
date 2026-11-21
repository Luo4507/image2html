import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesignToCode } from '../src/index.js';
import {
  createMCPServer,
  handleAnalyzeStructure,
  handleExtractAssets,
  handleGenerateComponent,
  handleRepairComponent,
  handleValidateDesign,
} from '../src/mcp/server.js';
import type { DesignToCodeResult, PageStructure, ValidationResult } from '../src/types.js';

const imagePath = 'examples/demo/login.png';
const validation: ValidationResult = {
  similarity: 72,
  passed: false,
  diffImage: 'large-diff-base64',
  regions: [{ x: 1, y: 2, width: 30, height: 40, diffPercentage: 12.5, diffPixels: 20, type: 'header' }],
  suggestions: ['Increase header spacing'],
  screenshots: { desktop: 'large-screenshot-base64' },
  quality: {
    overallSimilarity: 72,
    contentSimilarity: 70,
    edgeSimilarity: 68,
    contentRatio: 0.8,
    qualityScore: 71,
  },
};

const structure = {
  page: { title: 'Demo', type: 'dashboard', layout: { type: 'flex', direction: 'column' } },
  regions: [],
  components: [],
  designTokens: {},
} as unknown as PageStructure;

function successfulConversion(): DesignToCodeResult {
  return {
    success: true,
    code: {
      code: 'export default function Demo() {}',
      filename: 'Demo.tsx',
      imports: ['react'],
      components: ['Demo'],
    },
    validation,
    metrics: {
      analysisMs: 1,
      generationMs: 2,
      validationMs: 3,
      repairMs: 4,
      totalMs: 10,
      modelCalls: 2,
      repairIterations: 1,
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('MCP structured tool contract', () => {
  it('returns generation data, progress support, metrics and compact validation', async () => {
    const convert = vi.fn().mockResolvedValue(successfulConversion());
    const onProgress = vi.fn();
    const result = await handleGenerateComponent({ convert } as unknown as DesignToCode, {
      image_path: imagePath,
    }, onProgress);

    expect(convert.mock.calls[0][0].onProgress).toBe(onProgress);
    expect(result.structuredContent).toMatchObject({
      success: true,
      code: 'export default function Demo() {}',
      filename: 'Demo.tsx',
      imports: ['react'],
      components: ['Demo'],
      validation: { passed: false, similarity: 72 },
      metrics: { modelCalls: 2, repairIterations: 1 },
    });
    expect(JSON.stringify(result.structuredContent)).not.toContain('large-screenshot-base64');
    expect(JSON.stringify(result.structuredContent)).not.toContain('large-diff-base64');
    expect(result.content[0]).toMatchObject({ type: 'text' });
    expect(result.isError).not.toBe(true);
  });

  it('marks conversion failure as a structured tool error', async () => {
    const convert = vi.fn().mockResolvedValue({
      success: false,
      error: 'model unavailable',
      code: { code: '', filename: '', imports: [], components: [] },
    });
    const result = await handleGenerateComponent({ convert } as unknown as DesignToCode, {
      image_path: imagePath,
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      success: false,
      error: { code: 'GENERATION_FAILED', message: 'model unavailable' },
    });
  });

  it('returns validation failure as data rather than a protocol error', async () => {
    const validate = vi.fn().mockResolvedValue(validation);
    const result = await handleValidateDesign({ validate } as unknown as DesignToCode, {
      original_image: imagePath,
      code: '<main>demo</main>',
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      success: true,
      passed: false,
      similarity: 72,
      quality: { qualityScore: 71 },
      regions: [{ type: 'header', diffPercentage: 12.5 }],
      suggestions: ['Increase header spacing'],
    });
    expect(JSON.stringify(result.structuredContent)).not.toContain('base64');
  });

  it('uses the independent repair loop with target framework options', async () => {
    const repair = vi.fn().mockResolvedValue({
      ...successfulConversion(),
      code: { ...successfulConversion().code, code: '<main>repaired</main>', filename: 'component.html' },
      qualityHistory: [{ iteration: 0, score: 71, adopted: true, improved: true, validation }],
    });
    const result = await handleRepairComponent({ repair } as unknown as DesignToCode, {
      original_image: imagePath,
      code: '<main>current</main>',
      diff_regions: validation.regions,
      framework: 'react',
      style_framework: 'inline',
      component_library: 'antd',
      typescript: true,
      quality_mode: 'precision',
      threshold: 90,
    });

    expect(repair).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ code: '<main>current</main>' }),
      expect.objectContaining({ framework: 'react', styleFramework: 'inline', componentLibrary: 'antd', typescript: true }),
      expect.objectContaining({ maxIterations: 4, validationOverrides: { threshold: 90 } }),
    );
    expect(result.structuredContent).toMatchObject({
      success: true,
      code: '<main>repaired</main>',
      validation: { passed: false, similarity: 72 },
      repairIterations: 1,
      qualityHistory: [{ iteration: 0, validation: { similarity: 72 } }],
    });
    expect(JSON.stringify(result.structuredContent)).not.toContain('base64');
  });

  it('returns structure and asset data as typed fields', async () => {
    const analyzed = await handleAnalyzeStructure({
      analyzeStructure: vi.fn().mockResolvedValue(structure),
    } as unknown as DesignToCode, { image_path: imagePath });
    expect(analyzed.structuredContent).toEqual({ success: true, structure });

    const extracted = await handleExtractAssets({
      extractAssets: vi.fn().mockResolvedValue(['assets/logo.png']),
    } as unknown as DesignToCode, { image_path: imagePath, output_dir: 'assets' });
    expect(extracted.structuredContent).toEqual({
      success: true,
      outputDir: 'assets',
      paths: ['assets/logo.png'],
    });
  });

  it('uses a stable file-not-found error for every file-based tool', async () => {
    const missing = 'examples/demo/definitely-missing.png';
    const d2c = {} as DesignToCode;
    const calls = [
      () => handleGenerateComponent(d2c, { image_path: missing }),
      () => handleValidateDesign(d2c, { original_image: missing, code: 'x' }),
      () => handleRepairComponent(d2c, { original_image: missing, code: 'x' }),
      () => handleAnalyzeStructure(d2c, { image_path: missing }),
      () => handleExtractAssets(d2c, { image_path: missing }),
    ];

    for (const call of calls) {
      const result = await call();
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({
        success: false,
        error: { code: 'FILE_NOT_FOUND' },
      });
    }
  });

  it('publishes output schemas and protocol errors through a real MCP connection', async () => {
    const server = await createMCPServer();
    const client = new Client({ name: 'contract-test', version: '1.0.0' }, { capabilities: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      const tools = await client.listTools();
      expect(tools.tools).toHaveLength(5);
      expect(tools.tools.every((tool) => tool.outputSchema?.type === 'object')).toBe(true);

      const result = await client.callTool({
        name: 'generate_component',
        arguments: { image_path: 'examples/demo/not-found.png' },
      });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({
        success: false,
        error: { code: 'FILE_NOT_FOUND' },
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('supports a mocked generate, validate and repair workflow over MCP', async () => {
    const repairedValidation = { ...validation, similarity: 94, passed: true, regions: [], suggestions: [] };
    const convert = vi.fn().mockResolvedValue(successfulConversion());
    const validate = vi.fn().mockResolvedValue(validation);
    const repair = vi.fn().mockResolvedValue({
      ...successfulConversion(),
      code: { ...successfulConversion().code, code: '<main>best</main>' },
      validation: repairedValidation,
      qualityHistory: [
        { iteration: 0, score: 71, adopted: true, improved: true, validation },
        { iteration: 1, score: 94, adopted: true, improved: true, validation: repairedValidation },
      ],
    });
    const d2c = { convert, validate, repair, close: vi.fn().mockResolvedValue(undefined) };
    const server = await createMCPServer({ converterFactory: () => d2c as unknown as DesignToCode });
    const client = new Client({ name: 'workflow-test', version: '1.0.0' }, { capabilities: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      const generated = await client.callTool({
        name: 'generate_component',
        arguments: { image_path: imagePath, framework: 'react' },
      });
      const generatedData = generated.structuredContent as any;
      const checked = await client.callTool({
        name: 'validate_design',
        arguments: {
          original_image: imagePath,
          code: generatedData.code,
          framework: 'react',
          component_library: 'antd',
          typescript: true,
        },
      });
      const checkedData = checked.structuredContent as any;
      const repaired = await client.callTool({
        name: 'repair_component',
        arguments: {
          original_image: imagePath,
          code: generatedData.code,
          diff_regions: checkedData.regions,
          framework: 'react',
          component_library: 'antd',
          typescript: true,
        },
      });

      expect(validate.mock.calls[0][1].code).toBe(generatedData.code);
      expect(repair.mock.calls[0][1].code).toBe(generatedData.code);
      expect(repaired.structuredContent).toMatchObject({
        success: true,
        code: '<main>best</main>',
        validation: { similarity: 94, passed: true },
      });
      expect(d2c.close).toHaveBeenCalledTimes(3);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
