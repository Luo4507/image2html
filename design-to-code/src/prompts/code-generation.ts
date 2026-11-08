/**
 * 代码生成 Prompt（用于 GLM 5.3）
 */

import type { PageStructure, CodegenOptions } from '../types.js';

export function buildCodeGenerationPrompt(
  structure: PageStructure,
  options: CodegenOptions
): string {
  const { page, regions, components, designTokens } = structure;
  const { framework, styleFramework, componentLibrary, typescript, responsive, accessibility } =
    options;

  return `请根据以下页面结构 JSON，生成 ${framework} 代码。

## 页面结构
${JSON.stringify({ page, regions, components }, null, 2)}

## 设计要求

### 1. 技术栈
- 框架：${framework} ${framework === 'react' ? '18+' : framework === 'vue' ? '3+' : '5+'}
- 样式：${styleFramework}
- 语言：${typescript ? 'TypeScript' : 'JavaScript'}
- 组件库：${componentLibrary === 'antd' ? 'Ant Design' : componentLibrary === 'element' ? 'Element Plus' : '无'}

### 2. Design Token 使用（强制）
必须使用以下 CSS 变量，禁止写死颜色值和像素值：

:root {
  /* Colors */
  --color-primary: ${designTokens.colors.primary};
  --color-success: ${designTokens.colors.success};
  --color-warning: ${designTokens.colors.warning};
  --color-error: ${designTokens.colors.error};
  --color-text-primary: ${designTokens.colors.textPrimary};
  --color-text-secondary: ${designTokens.colors.textSecondary};
  --color-background: ${designTokens.colors.background};
  
  /* Typography */
  --text-h1: ${designTokens.typography.h1.fontSize};
  --text-h2: ${designTokens.typography.h2.fontSize};
  --text-body: ${designTokens.typography.body.fontSize};
  
  /* Spacing */
  --spacing-xs: 8px;
  --spacing-sm: 16px;
  --spacing-md: 24px;
  --spacing-lg: 32px;
  
  /* Border Radius */
  --radius-sm: ${designTokens.borderRadius.sm};
  --radius-md: ${designTokens.borderRadius.md};
  --radius-lg: ${designTokens.borderRadius.lg};
}

### 3. 组件化要求
- 将页面拆分为语义化组件：Header、Sidebar、Card、Table、Form 等
- 每个组件独立定义，使用 ${typescript ? 'TypeScript 接口' : 'PropTypes'} 定义 Props
${componentLibrary !== 'none' ? `- 优先使用 ${componentLibrary === 'antd' ? 'Ant Design' : 'Element Plus'} 组件库` : '- 使用原生 HTML 元素'}

### 4. 代码规范
- 使用${framework === 'react' ? '函数式组件 + Hooks' : framework === 'vue' ? 'Composition API' : '语义化 HTML'}
- 添加必要的 ${typescript ? 'TypeScript 类型定义' : 'JSDoc 注释'}
- 关键元素添加 data-testid 属性
${accessibility ? '- 确保可访问性（ARIA 标签、键盘导航、语义化标签）' : ''}

${responsive ? `### 5. 响应式要求
- 桌面端：1440px 基准
- 平板端：768px 适配
- 移动端：375px 适配
- 使用 ${styleFramework === 'tailwind' ? 'Tailwind 响应式前缀（sm: md: lg:）' : 'CSS 媒体查询'}` : ''}

请生成完整、可运行的代码，包含必要的导入语句。
只输出代码，不要包含解释文字。`;
}

/**
 * 构建差异修复 Prompt
 */
export function buildRepairPrompt(
  originalStructure: PageStructure,
  currentCode: string,
  diffRegions: Array<{ type: string; diffPercentage: number }>
): string {
  const diffDescription = diffRegions
    .map((r) => `- ${r.type} 区域差异 ${r.diffPercentage}%`)
    .join('\n');

  return `页面视觉校验发现以下差异，请修复代码：

## 差异描述
${diffDescription}

## 原始设计结构
${JSON.stringify(originalStructure.components, null, 2)}

## 当前代码
${currentCode}

## 修复要求
1. 分析差异原因（颜色、间距、字体、布局等）
2. 只修改有问题的部分，保持其他代码不变
3. 确保修复后代码仍然可运行
4. 使用 Design Token，不要写死样式值

请输出修复后的完整代码。`;
}
