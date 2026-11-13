export class CodegenOptionError extends Error {
  override readonly name = 'CodegenOptionError';
}

import type { CodegenOptions } from '../types.js';

/** Reject combinations that cannot produce a runnable project before calling a model. */
export function assertValidCodegenOptions(options: CodegenOptions): void {
  const { framework, componentLibrary, styleFramework, layoutMode } = options;

  if (framework === 'react' && componentLibrary === 'element') {
    throw new CodegenOptionError('React supports Ant Design (antd) or none; Element Plus (element) requires Vue');
  }
  if (framework === 'vue' && componentLibrary === 'antd') {
    throw new CodegenOptionError('Vue supports Element Plus (element) or none; Ant Design (antd) requires React');
  }
  if (framework === 'html' && componentLibrary !== 'none') {
    throw new CodegenOptionError('HTML output only supports componentLibrary: none');
  }
  if (framework !== 'html' && !['tailwind', 'inline'].includes(styleFramework)) {
    const label = framework === 'react' ? 'React' : 'Vue';
    throw new CodegenOptionError(`${label} currently supports tailwind or inline styles; ${styleFramework} requires a multi-file generation protocol`);
  }
}

