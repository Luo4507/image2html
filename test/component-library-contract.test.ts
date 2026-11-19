import { describe, expect, it } from 'vitest';
import {
  buildDirectGenerationPrompt,
  buildVisualPatchPrompt,
  buildVisualRepairPrompt,
} from '../src/prompts/direct-generation.js';
import { buildCompileRepairPrompt } from '../src/prompts/compile-repair.js';
import type { CodegenOptions } from '../src/types.js';

const reactAntd: CodegenOptions = {
  framework: 'react', styleFramework: 'tailwind', componentLibrary: 'antd',
  typescript: true, responsive: true, accessibility: true,
};

function expectContract(prompt: string): void {
  expect(prompt).toContain('Ant Design 5.0.0');
  expect(prompt).toContain('<Breadcrumb.Item>');
  expect(prompt).toMatch(/Breadcrumb[^\n]*不得使用 `items`/);
}

function expectLayoutThemeContract(prompt: string): void {
  expect(prompt).toContain('Layout.Header');
  expect(prompt).toContain('!bg-white');
  expect(prompt).toContain('theme="dark"');
  expect(prompt).toContain('Typography');
  expect(prompt).toContain('!text-white');
}

describe('component library API contracts', () => {
  it('uses the installed Breadcrumb API in generation and repair', () => {
    expectContract(buildDirectGenerationPrompt(reactAntd));
    expectContract(buildCompileRepairPrompt({
      current: { code: 'export default function Broken() {}', filename: 'Broken.tsx', imports: [], components: [] },
      options: reactAntd,
      diagnostics: "Property 'items' does not exist on type 'BreadcrumbProps'",
    }));
  });

  it('preserves light headers and dark menus in generation and every repair path', () => {
    const current = { code: 'export default function Dashboard() {}', filename: 'Dashboard.tsx', imports: [], components: [] };
    const visualInput = {
      currentCode: current.code,
      suggestions: ['检查 Header 背景色和 Sidebar 菜单样式'],
      regions: [{ type: 'header', diffPercentage: 64 }],
      options: reactAntd,
    };
    const prompts = [
      buildDirectGenerationPrompt(reactAntd),
      buildCompileRepairPrompt({ current, options: reactAntd, diagnostics: 'visual style repair' }),
      buildVisualPatchPrompt(visualInput),
      buildVisualRepairPrompt(visualInput),
    ];
    prompts.forEach(expectLayoutThemeContract);
  });

  it('omits Ant Design rules when no library is selected', () => {
    expect(buildDirectGenerationPrompt({ ...reactAntd, componentLibrary: 'none' }))
      .not.toContain('Ant Design 5.0.0');
  });
});
