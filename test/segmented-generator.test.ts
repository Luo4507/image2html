import { describe, expect, it } from 'vitest';
import { parseRegionPlan } from '../src/prompts/region-planning.js';
import { assembleFrameworkRegionCode, assembleHtmlDocument } from '../src/segmented-generator.js';
import type { CodegenOptions } from '../src/types.js';

function options(framework: 'react' | 'vue'): CodegenOptions {
  return {
    framework, styleFramework: 'inline', componentLibrary: framework === 'react' ? 'antd' : 'element',
    typescript: true, responsive: true, accessibility: true, layoutMode: 'segmented',
  };
}

describe('segmented generation', () => {
  it('parses and orders a compact region plan', () => {
    const plan = parseRegionPlan(`{"regions":[
      {"id":"main","type":"main","startY":200,"endY":800,"description":"main"},
      {"id":"header","type":"header","startY":0,"endY":200,"description":"header"}
    ]}`);
    expect(plan.map((region) => region.id)).toEqual(['header', 'main']);
  });

  it('assembles region fragments into a complete HTML document', () => {
    const html = assembleHtmlDocument('Demo', ['<header>Header</header>', '<main>Main</main>']);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<header>Header</header>');
    expect(html).toContain('<main>Main</main>');
  });

  it('assembles named React regions with deduplicated imports', () => {
    const code = assembleFrameworkRegionCode(options('react'), [
      `import { Button } from 'antd';\nexport function HeaderRegion() { return <Button>Header</Button>; }`,
      `import { Button } from 'antd';\nexport function ContentRegion() { return <main>Content</main>; }`,
    ]);

    expect(code.match(/from 'antd'/g)).toHaveLength(1);
    expect(code).toContain('export default function GeneratedPage()');
    expect(code).toContain('<HeaderRegion />');
    expect(code).toContain('<ContentRegion />');
  });

  it('assembles Vue SFC template, script and style regions', () => {
    const code = assembleFrameworkRegionCode(options('vue'), [
      `<template><header>Header</header></template><script setup lang="ts">import { ElButton } from 'element-plus';</script><style>header { color: red; }</style>`,
      `<template><main>Content</main></template><style>main { color: blue; }</style>`,
    ]);

    expect(code.match(/<template>/g)).toHaveLength(1);
    expect(code).toContain('<header>Header</header>');
    expect(code).toContain('<main>Content</main>');
    expect(code).toContain("import { ElButton } from 'element-plus';");
    expect(code).toContain('header { color: red; }');
    expect(code).toContain('main { color: blue; }');
  });
});
