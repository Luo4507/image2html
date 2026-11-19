import type { CodegenOptions } from '../types.js';

export function buildComponentLibraryContract(
  options: Pick<CodegenOptions, 'framework' | 'componentLibrary'>,
): string {
  if (options.framework === 'react' && options.componentLibrary === 'antd') {
    return [
      '- 当前运行时为 Ant Design 5.0.0；`Breadcrumb` 必须使用 `<Breadcrumb><Breadcrumb.Item>...</Breadcrumb.Item></Breadcrumb>` 子节点写法，不得使用 `items` 属性。',
      '- 浅色 `Layout.Header` 必须使用 `!bg-white` 或等价内联背景，不要只写会被组件默认样式覆盖的 `bg-white`；具体颜色仍以设计稿为准。',
      '- 暗色侧边栏中的 `Menu` 必须显式设置 `theme="dark"`，确保菜单文字和选中态与背景有足够对比度。',
      '- 暗色侧边栏中的 `Typography` 品牌标题和文字必须显式使用 `!text-white` 或设计稿对应的浅色，不要依赖父级文字颜色覆盖组件默认色。',
    ].join('\n');
  }
  return '';
}
