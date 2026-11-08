/**
 * 视觉校验器
 */

import { chromium, type Browser, type Page } from 'playwright';
import pixelmatch from 'pixelmatch';
import sharp from 'sharp';
import type { ValidationResult, DiffRegion, Viewport, ValidationConfig } from '../types.js';

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
  private async renderHtml(html: string, viewport: Viewport): Promise<Buffer> {
    const browser = await this.initBrowser();
    const page: Page = await browser.newPage({ viewport });

    try {
      await page.setContent(html, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);

      const screenshot = await page.screenshot({
        fullPage: true,
        type: 'png',
      });

      return screenshot;
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
      .raw()
      .toBuffer({ resolveWithObject: true });
    const generatedPixels = await sharp(generatedResized)
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
      { threshold: 0.1, includeAA: false }
    );

    const totalPixels = width * height;
    const similarity = (1 - diffCount / totalPixels) * 100;

    // 生成差异图片 base64
    const diffImage = await sharp(diffPixels, {
      raw: {
        width,
        height,
        channels: 4,
      },
    })
      .png()
      .toBuffer();

    // 分析差异区域
    const regions = await this.analyzeDiffRegions(
      originalResized,
      generatedResized,
      width,
      height
    );

    return {
      similarity: Math.round(similarity * 100) / 100,
      diffImage: diffImage.toString('base64'),
      regions,
    };
  }

  /**
   * 分析差异区域
   */
  private async analyzeDiffRegions(
    originalBuffer: Buffer,
    generatedBuffer: Buffer,
    width: number,
    height: number
  ): Promise<DiffRegion[]> {
    const regions: DiffRegion[] = [];
    const gridSize = 100;

    for (let y = 0; y < height; y += gridSize) {
      for (let x = 0; x < width; x += gridSize) {
        const regionWidth = Math.min(gridSize, width - x);
        const regionHeight = Math.min(gridSize, height - y);

        const originalRegion = await sharp(originalBuffer)
          .extract({ left: x, top: y, width: regionWidth, height: regionHeight })
          .raw()
          .toBuffer({ resolveWithObject: true });

        const generatedRegion = await sharp(generatedBuffer)
          .extract({ left: x, top: y, width: regionWidth, height: regionHeight })
          .raw()
          .toBuffer({ resolveWithObject: true });

        const diffPixels = Buffer.alloc(regionWidth * regionHeight * 4);
        const diffCount = pixelmatch(
          originalRegion.data,
          generatedRegion.data,
          diffPixels,
          regionWidth,
          regionHeight,
          { threshold: 0.1 }
        );

        const regionPixels = regionWidth * regionHeight;
        const diffPercentage = (diffCount / regionPixels) * 100;

        if (diffPercentage > 10) {
          regions.push({
            x,
            y,
            width: regionWidth,
            height: regionHeight,
            diffPercentage: Math.round(diffPercentage * 100) / 100,
            type: this.classifyRegionType(x, y, width, height),
          });
        }
      }
    }

    return regions;
  }

  /**
   * 分类区域类型
   */
  private classifyRegionType(
    x: number,
    y: number,
    width: number,
    height: number
  ): DiffRegion['type'] {
    if (y < height * 0.1) return 'header';
    if (y > height * 0.9) return 'footer';
    if (x < width * 0.2) return 'sidebar';
    return 'main';
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
  private async captureAllViewports(html: string): Promise<{
    desktop: string;
    tablet: string;
    mobile: string;
  }> {
    const [desktop, tablet, mobile] = await Promise.all([
      this.renderHtml(html, this.config.viewports.desktop),
      this.renderHtml(html, this.config.viewports.tablet),
      this.renderHtml(html, this.config.viewports.mobile),
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
    generatedHtml: string,
    options: {
      captureAllViewports?: boolean;
    } = {}
  ): Promise<ValidationResult> {
    // 1. 渲染生成的 HTML
    const generatedScreenshot = await this.renderHtml(
      generatedHtml,
      this.config.viewports.desktop
    );

    // 2. 对比图片
    const { similarity, diffImage, regions } = await this.compareImages(
      originalImageBuffer,
      generatedScreenshot
    );

    // 3. 生成修复建议
    const suggestions = this.generateSuggestions(similarity, regions);

    // 4. 捕获多端截图（可选）
    let screenshots = {
      desktop: generatedScreenshot.toString('base64'),
      tablet: '',
      mobile: '',
    };

    if (options.captureAllViewports) {
      screenshots = await this.captureAllViewports(generatedHtml);
    }

    return {
      similarity,
      passed: similarity >= this.config.threshold,
      diffImage,
      regions,
      suggestions,
      screenshots,
    };
  }
}
