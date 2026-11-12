import type { CodegenOptions, GeneratedCode } from '../types.js';

export function buildCompileRepairPrompt(input: {
  current: GeneratedCode;
  options: CodegenOptions;
  diagnostics: string;
}): string {
  const { options } = input;
  const dependencies = options.framework === 'react'
    ? ['react', 'react-dom', ...(options.componentLibrary === 'antd' ? ['antd', '@ant-design/icons'] : [])]
    : ['vue', ...(options.componentLibrary === 'element' ? ['element-plus', '@element-plus/icons-vue'] : [])];
  const frameworkContract = options.framework === 'react'
    ? '保持默认导出 React 页面组件；TypeScript 开启时返回合法 TSX，否则返回合法 JSX。'
    : '保持合法 Vue 3 SFC，包含 template、script setup 和必要 style；TypeScript 开启时提供合法类型。';

  return `请根据真实编译或运行诊断修复当前 ${options.framework} 源码。

## 诊断
${input.diagnostics.slice(0, 8000)}

## 当前源码
${input.current.code}

## 修复要求
- ${frameworkContract}
- 解决诊断中的根因，不删除整段页面来规避错误，不放宽 TypeScript 配置。
- 仅允许这些外部依赖：${dependencies.join('、')}；不得创造不存在的导出或依赖。
- 保留已有页面结构、文字、样式和资源 /assets 引用。
- 输出修复后的完整源码文件，不要 Markdown、JSON、解释或分析。`;
}
