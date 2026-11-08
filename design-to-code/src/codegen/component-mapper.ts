/**
 * 组件库映射器
 */

import type { CodegenOptions } from '../types.js';

export class ComponentMapper {
  private library: CodegenOptions['componentLibrary'];

  constructor(library: CodegenOptions['componentLibrary']) {
    this.library = library;
  }

  /**
   * 执行组件映射
   */
  mapComponents(code: string): string {
    if (this.library === 'none') {
      return code;
    }

    // 按顺序映射组件
    code = this.mapButton(code);
    code = this.mapInput(code);
    code = this.mapSelect(code);
    code = this.mapCard(code);
    code = this.mapForm(code);

    return code;
  }

  /**
   * 映射按钮组件
   */
  private mapButton(code: string): string {
    if (this.library !== 'antd') return code;

    const buttonPattern = /<button([^>]*)>(.*?)<\/button>/gs;

    code = code.replace(buttonPattern, (match, attrs, content) => {
      // 推断按钮类型
      let btnType = 'default';
      if (attrs.includes('bg-primary') || attrs.includes('primary')) {
        btnType = 'primary';
      } else if (attrs.includes('bg-error') || attrs.includes('danger')) {
        btnType = 'primary';
        attrs += ' danger';
      } else if (attrs.includes('bg-transparent')) {
        btnType = 'text';
      }

      // 推断大小
      let size = 'middle';
      if (attrs.includes('px-6') || attrs.includes('py-3')) {
        size = 'large';
      } else if (attrs.includes('px-2') || attrs.includes('py-1')) {
        size = 'small';
      }

      return `<Button type="${btnType}" size="${size}">${content}</Button>`;
    });

    // 添加导入
    if (code.includes('<Button') && !code.includes("from 'antd'")) {
      code = this.addAntdImport(code, ['Button']);
    }

    return code;
  }

  /**
   * 映射输入框组件
   */
  private mapInput(code: string): string {
    if (this.library !== 'antd') return code;

    const inputPattern = /<input([^>]*)\/?>/g;

    code = code.replace(inputPattern, (match, attrs) => {
      // 提取 placeholder
      const placeholderMatch = attrs.match(/placeholder="([^"]*)"/);
      const placeholder = placeholderMatch ? placeholderMatch[1] : '';

      return `<Input placeholder="${placeholder}" />`;
    });

    if (code.includes('<Input') && !code.includes("from 'antd'")) {
      code = this.addAntdImport(code, ['Input']);
    }

    return code;
  }

  /**
   * 映射选择器组件
   */
  private mapSelect(code: string): string {
    if (this.library !== 'antd') return code;

    const selectPattern = /<select([^>]*)>(.*?)<\/select>/gs;

    code = code.replace(selectPattern, (match, attrs, optionsHtml) => {
      // 提取选项
      const options = [...optionsHtml.matchAll(/<option[^>]*value="([^"]*)"[^>]*>(.*?)<\/option>/g)];
      const optionsStr = options
        .map(([, value, label]) => `{ value: "${value}", label: "${label}" }`)
        .join(', ');

      return `<Select options={[{${optionsStr}}]} />`;
    });

    if (code.includes('<Select') && !code.includes("from 'antd'")) {
      code = this.addAntdImport(code, ['Select']);
    }

    return code;
  }

  /**
   * 映射卡片组件
   */
  private mapCard(code: string): string {
    if (this.library !== 'antd') return code;

    // 检测卡片特征：有阴影、圆角、padding 的 div
    const cardPattern = /<div([^>]*class="[^"]*shadow[^"]*rounded[^"]*"[^>]*)>(.*?)<\/div>/gs;

    code = code.replace(cardPattern, (match, attrs, content) => {
      // 提取标题（如果有）
      const titleMatch = content.match(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/);
      const title = titleMatch ? titleMatch[1] : '';

      // 移除标题元素
      if (titleMatch) {
        content = content.replace(titleMatch[0], '');
      }

      return `<Card title="${title}">${content}</Card>`;
    });

    if (code.includes('<Card') && !code.includes("from 'antd'")) {
      code = this.addAntdImport(code, ['Card']);
    }

    return code;
  }

  /**
   * 映射表单组件
   */
  private mapForm(code: string): string {
    if (this.library !== 'antd') return code;

    const formPattern = /<form([^>]*)>(.*?)<\/form>/gs;

    code = code.replace(formPattern, (match, attrs, content) => {
      // 包装表单项
      content = content.replace(
        /(<Input[^>]*\/>)/g,
        '<Form.Item label="字段名">$1</Form.Item>'
      );

      return `<Form layout="vertical">${content}</Form>`;
    });

    if (code.includes('<Form') && !code.includes("from 'antd'")) {
      code = this.addAntdImport(code, ['Form']);
    }

    return code;
  }

  /**
   * 添加 antd 组件导入
   */
  private addAntdImport(code: string, components: string[]): string {
    const importLine = `import { ${components.join(', ')} } from 'antd';\n`;

    // 检查是否已有 antd 导入
    if (code.includes("from 'antd'")) {
      // 合并导入
      const importPattern = /import\s*{([^}]*)}\s*from\s*'antd';/;
      const match = code.match(importPattern);

      if (match) {
        const existing = match[1].split(',').map((s) => s.trim());
        const newComponents = [...new Set([...existing, ...components])];
        const newImport = `import { ${newComponents.join(', ')} } from 'antd';`;
        code = code.replace(importPattern, newImport);
      }
    } else {
      // 在文件开头添加
      const lines = code.split('\n');
      const lastImportIndex = lines.reduce(
        (max, line, index) => (line.startsWith('import') ? index : max),
        -1
      );

      if (lastImportIndex >= 0) {
        lines.splice(lastImportIndex + 1, 0, importLine);
        code = lines.join('\n');
      } else {
        code = importLine + '\n' + code;
      }
    }

    return code;
  }
}
