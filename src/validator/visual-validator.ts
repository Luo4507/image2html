/**
 * 视觉校验器
 */

import { chromium, type Browser, type Page } from 'playwright';
import pixelmatch from 'pixelmatch';
import sharp from 'sharp';
import type {
  ValidationResult,
  DiffRegion,
  Viewport,
  ValidationConfig,
  VisualQualityMetrics,
  CodegenOptions,
  GeneratedCode,
} from '../types.js';
import { calculateQualityMetrics } from './quality-metrics.js';
import { aggregateDiffRegions } from './region-diff.js';
import { passesQualityGate } from './quality-gate.js';
import { startFrameworkProject, type RunningFrameworkProject } from '../runtime/vite-runtime.js';

interface RenderTarget {
  content: string;
  isUrl: boolean;
  framework?: CodegenOptions['framework'];
}
export class VisualValidator {
  private config: ValidationConfig;
  private browser: Browser | null = null;

  constructor(config: ValidationConfig) {
    this.config = config;
  }

  /**
   * 初始化浏览器
   */
  private async initBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
    return this.browser;
  }

  /**
   * 关闭浏览器
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * 渲染 HTML 并截图
   */
  private async renderHtml(target: RenderTarget, viewport: Viewport): Promise<Buffer> {
    const browser = await this.initBrowser();
    const page: Page = await browser.newPage({ viewport });
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));

    try {
      if (target.isUrl) {
        await page.goto(target.content, { waitUntil: 'networkidle' });
      } else {
        await page.setContent(target.content, { waitUntil: 'networkidle' });
      }
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);

      if (target.framework && target.framework !== 'html') {
        const label = target.framework === 'react' ? 'React' : 'Vue';
        if (runtimeErrors.length > 0) {
          throw new Error(`${label} browser runtime failed: ${runtimeErrors.join('; ')}`);
        }
        const mounted = await page.locator('#root').evaluate((root) => root.childElementCount > 0);
        if (!mounted) {
          throw new Error(`${label} render failed: #root is empty after mount`);
        }
      }

      return await page.screenshot({
        fullPage: true,
        type: 'png',
      });
    } finally {
      await page.close();
    }
  }
  /**
   * 对比两张图片，返回相似度和差异区域
   */
  private async compareImages(
    originalBuffer: Buffer,
    generatedBuffer: Buffer
  ): Promise<{
    similarity: number;
    diffImage: string;
    regions: DiffRegion[];
    quality: VisualQualityMetrics;
  }> {
    // 统一尺寸
    const original = sharp(originalBuffer);
    const generated = sharp(generatedBuffer);

    const originalMeta = await original.metadata();
    const width = originalMeta.width || 1440;
    const height = originalMeta.height || 900;

    const originalResized = await original.resize(width, height).png().toBuffer();
    const generatedResized = await generated.resize(width, height).png().toBuffer();

    // 获取像素数据
    const originalPixels = await sharp(originalResized)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const generatedPixels = await sharp(generatedResized)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // 创建差异图片
    const diffPixels = Buffer.alloc(width * height * 4);

    const diffCount = pixelmatch(
      originalPixels.data,
      generatedPixels.data,
      diffPixels,
      width,
      height,
      { threshold: 0.1, includeAA: false, diffMask: true }
    );

    const totalPixels = width * height;
    const similarity = (1 - diffCount / totalPixels) * 100;

    const displayDiff = Buffer.alloc(width * height * 4);
    for (let index = 0; index < displayDiff.length; index += 4) {
      const changed = diffPixels[index + 3] > 0;
      displayDiff[index] = 255;
      displayDiff[index + 1] = changed ? 0 : 255;
      displayDiff[index + 2] = changed ? 0 : 255;
      displayDiff[index + 3] = 255;
    }

    // 生成差异图片 base64
    const diffImage = await sharp(displayDiff, {
      raw: {
        width,
        height,
        channels: 4,
      },
    })
      .png()
      .toBuffer();

    const quality = calculateQualityMetrics({
      original: originalPixels.data,
      generated: generatedPixels.data,
      width,
      height,
    });
    const regions = aggregateDiffRegions(diffPixels, width, height);

    return {
      similarity: Math.round(similarity * 100) / 100,
      diffImage: diffImage.toString('base64'),
      regions,
      quality,
    };
  }

  /**
   * 生成修复建议
   */
  private generateSuggestions(similarity: number, regions: DiffRegion[]): string[] {
    if (similarity >= this.config.threshold) {
      return ['校验通过，无需修改'];
    }

    const suggestions: string[] = [];

    if (regions.some((r) => r.type === 'header')) {
      suggestions.push('检查 Header 区域高度、背景色和边框是否一致');
    }
    if (regions.some((r) => r.type === 'sidebar')) {
      suggestions.push('验证 Sidebar 宽度、背景色和菜单项样式');
    }
    if (regions.some((r) => r.type === 'main')) {
      suggestions.push('检查主内容区 padding、margin 和布局结构');
    }
    if (regions.some((r) => r.type === 'footer')) {
      suggestions.push('确认 Footer 高度、背景色和内容对齐方式');
    }

    // 通用建议
    suggestions.push('确认字体大小和字重是否匹配设计稿');
    suggestions.push('检查颜色值是否使用了 Design Token');
    suggestions.push('验证圆角、阴影等细节样式');

    return suggestions;
  }

  /**
   * 捕获所有视口截图
   */
  private async captureAllViewports(target: RenderTarget): Promise<{
    desktop: string;
    tablet: string;
    mobile: string;
  }> {
    const [desktop, tablet, mobile] = await Promise.all([
      this.renderHtml(target, this.config.viewports.desktop),
      this.renderHtml(target, this.config.viewports.tablet),
      this.renderHtml(target, this.config.viewports.mobile),
    ]);

    return {
      desktop: desktop.toString('base64'),
      tablet: tablet.toString('base64'),
      mobile: mobile.toString('base64'),
    };
  }
  /**
   * 执行视觉校验
   */
  async validate(
    originalImageBuffer: Buffer,
    generatedInput: string | GeneratedCode,
    options: {
      captureAllViewports?: boolean;
      codegenOptions?: CodegenOptions;
    } = {}
  ): Promise<ValidationResult> {
    const generated: GeneratedCode = typeof generatedInput === 'string'
      ? { code: generatedInput, filename: '', imports: [], components: [] }
      : generatedInput;
    const targetOptions = options.codegenOptions;
    let running: RunningFrameworkProject | undefined;

    try {
      let target: RenderTarget = { content: generated.code, isUrl: false, framework: 'html' };
      if (targetOptions && targetOptions.framework !== 'html') {
        const filename = generated.filename || (targetOptions.framework === 'react'
          ? `GeneratedPage.${targetOptions.typescript ? 'tsx' : 'jsx'}`
          : 'GeneratedPage.vue');
        running = await startFrameworkProject({ ...generated, filename }, targetOptions);
        target = { content: running.url, isUrl: true, framework: targetOptions.framework };
      }

      // 1. 按原图尺寸渲染，避免固定桌面视口影响移动稿校验
      const sourceMetadata = await sharp(originalImageBuffer).metadata();
      const sourceViewport = {
        width: sourceMetadata.width || this.config.viewports.desktop.width,
        height: sourceMetadata.height || this.config.viewports.desktop.height,
      };
      const generatedScreenshot = await this.renderHtml(target, sourceViewport);

      // 2. 对比图片
      const { similarity, diffImage, regions, quality } = await this.compareImages(
        originalImageBuffer,
        generatedScreenshot
      );

      // 3. 生成修复建议
      const suggestions = this.generateSuggestions(quality.qualityScore, regions);

      // 4. 捕获多端截图（可选）
      let screenshots = {
        desktop: generatedScreenshot.toString('base64'),
        tablet: '',
        mobile: '',
      };

      if (options.captureAllViewports) {
        screenshots = await this.captureAllViewports(target);
      }

      return {
        similarity,
        quality,
        passed: passesQualityGate(quality, this.config),
        diffImage,
        regions,
        suggestions,
        screenshots,
      };
    } finally {
      await running?.close();
    }
  }
}

