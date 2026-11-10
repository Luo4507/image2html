/**
 * Design Token 映射器
 */

import type { DesignTokens } from '../types.js';

export class TokenMapper {
  private colorMap: Map<string, string>;
  private spacingMap: Map<string, string>;
  private fontSizeMap: Map<string, string>;

  constructor(tokens: DesignTokens) {
    this.colorMap = new Map([
      [tokens.colors.primary.toLowerCase(), 'var(--color-primary)'],
      [tokens.colors.success.toLowerCase(), 'var(--color-success)'],
      [tokens.colors.warning.toLowerCase(), 'var(--color-warning)'],
      [tokens.colors.error.toLowerCase(), 'var(--color-error)'],
      [tokens.colors.textPrimary.toLowerCase(), 'var(--color-text-primary)'],
      [tokens.colors.textSecondary.toLowerCase(), 'var(--color-text-secondary)'],
      [tokens.colors.background.toLowerCase(), 'var(--color-background)'],
    ]);

    this.spacingMap = new Map();
    tokens.spacing.scale.forEach((value, index) => {
      const names = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];
      if (index < names.length) {
        this.spacingMap.set(`${value}px`, `var(--spacing-${names[index]})`);
      }
    });

    this.fontSizeMap = new Map([
      [tokens.typography.h1.fontSize, 'var(--text-h1)'],
      [tokens.typography.h2.fontSize, 'var(--text-h2)'],
      [tokens.typography.body.fontSize, 'var(--text-body)'],
    ]);
  }

  /**
   * 执行 Token 映射
   */
  mapCode(code: string): string {
    // 1. 映射颜色
    for (const [hexValue, token] of this.colorMap) {
      code = this.replaceColor(code, hexValue, token);
    }

    // 2. 映射间距
    for (const [pxValue, token] of this.spacingMap) {
      code = this.replaceSpacing(code, pxValue, token);
    }

    // 3. 映射字体大小
    for (const [pxValue, token] of this.fontSizeMap) {
      code = this.replaceFontSize(code, pxValue, token);
    }

    // 4. 恢复 Token 自身的定义，避免 --color-primary: var(--color-primary)
    code = this.restoreTokenDefinitions(code);

    // 5. 添加 CSS 变量定义
    code = this.addTokenDefinitions(code);

    return code;
  }

  /**
   * 替换颜色值
   */
  private replaceColor(code: string, hexValue: string, token: string): string {
    // 匹配 Tailwind 类: bg-[#1890ff], text-[#262626]
    const tailwindPattern = new RegExp(`(\\w+)-\\[${this.escapeRegex(hexValue)}\\]`, 'gi');
    code = code.replace(tailwindPattern, `$1-[${token}]`);

    // 匹配内联样式: background: #1890ff
    const inlinePattern = new RegExp(
      `(background|color|border-color):\\s*${this.escapeRegex(hexValue)}`,
      'gi'
    );
    code = code.replace(inlinePattern, `$1: ${token}`);

    // 匹配十六进制颜色（不带 #）
    const hexWithoutHash = hexValue.replace('#', '');
    const hexPattern = new RegExp(`#${this.escapeRegex(hexWithoutHash)}`, 'gi');
    code = code.replace(hexPattern, token);

    return code;
  }

  /**
   * 替换间距值
   */
  private replaceSpacing(code: string, pxValue: string, token: string): string {
    // 匹配 Tailwind 类: p-[8px], m-[16px]
    const pattern = new RegExp(`([pm][xytrbl]?)-\\[${this.escapeRegex(pxValue)}\\]`, 'g');
    code = code.replace(pattern, `$1-[${token}]`);

    // 匹配内联样式: padding: 8px
    const inlinePattern = new RegExp(
      `(padding|margin|gap):\\s*${this.escapeRegex(pxValue)}`,
      'gi'
    );
    code = code.replace(inlinePattern, `$1: ${token}`);

    return code;
  }

  /**
   * 替换字体大小
   */
  private replaceFontSize(code: string, pxValue: string, token: string): string {
    // 匹配 Tailwind 类: text-[24px]
    const pattern = new RegExp(`text-\\[${this.escapeRegex(pxValue)}\\]`, 'g');
    code = code.replace(pattern, `text-[${token}]`);

    // 匹配内联样式: font-size: 24px
    const inlinePattern = new RegExp(`font-size:\\s*${this.escapeRegex(pxValue)}`, 'gi');
    code = code.replace(inlinePattern, `font-size: ${token}`);

    return code;
  }

  /**
   * 添加 Token 定义
   */
  private addTokenDefinitions(code: string): string {
    // 检查是否已有 token 定义
    if (code.includes('--color-primary')) {
      return code;
    }

    const tokenDefinitions = this.generateTokenDefinitions();

    // 在 <style> 标签中添加
    if (code.includes('<style>')) {
      code = code.replace('<style>', `<style>\n${tokenDefinitions}`);
    } else if (code.includes('<head>')) {
      code = code.replace('<head>', `<head>\n<style>\n${tokenDefinitions}\n</style>`);
    } else {
      // 在代码开头添加
      code = `<style>\n${tokenDefinitions}\n</style>\n\n${code}`;
    }

    return code;
  }

  /**
   * 恢复 Token 定义中的原始值
   */
  private restoreTokenDefinitions(code: string): string {
    const mappings = [this.colorMap, this.spacingMap, this.fontSizeMap];

    for (const mapping of mappings) {
      for (const [value, token] of mapping) {
        const variableName = token.slice(4, -1);
        const pattern = new RegExp(
          `(${this.escapeRegex(variableName)}\\s*):\\s*${this.escapeRegex(token)}`,
          'g'
        );
        code = code.replace(pattern, `$1: ${value}`);
      }
    }

    return code;
  }

  /**
   * 生成 Token 定义
   */
  private generateTokenDefinitions(): string {
    const lines: string[] = [':root {'];

    // 颜色
    lines.push('  /* Colors */');
    for (const [hex, token] of this.colorMap) {
      const varName = token.replace('var(', '').replace(')', '');
      lines.push(`  ${varName}: ${hex};`);
    }

    // 间距
    lines.push('\n  /* Spacing */');
    for (const [px, token] of this.spacingMap) {
      const varName = token.replace('var(', '').replace(')', '');
      lines.push(`  ${varName}: ${px};`);
    }

    // 字体
    lines.push('\n  /* Typography */');
    for (const [px, token] of this.fontSizeMap) {
      const varName = token.replace('var(', '').replace(')', '');
      lines.push(`  ${varName}: ${px};`);
    }

    lines.push('}');

    return lines.join('\n');
  }

  /**
   * 转义正则特殊字符
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
