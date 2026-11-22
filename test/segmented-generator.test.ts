import { describe, expect, it } from 'vitest';
import { parseRegionPlan } from '../src/prompts/region-planning.js';
import { assembleFrameworkRegionCode, assembleHtmlDocument, normalizePlannedRegions } from '../src/segmented-generator.js';
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

  it('merges tiny model regions and keeps complete non-overlapping coverage', () => {
    const plan = parseRegionPlan(`{"regions":[
      {"id":"header","type":"header","startY":0,"endY":1,"description":"header"},
      {"id":"main","type":"main","startY":1,"endY":400,"description":"main"},
      {"id":"section","type":"section","startY":400,"endY":800,"description":"section"},
      {"id":"footer","type":"footer","startY":800,"endY":801,"description":"footer"}
    ]}`);
    const normalized = normalizePlannedRegions(plan, 981);

    expect(normalized).toHaveLength(2);
    expect(normalized.map(({ startY, endY }) => ({ startY, endY }))).toEqual([
      { startY: 0, endY: 400 },
      { startY: 400, endY: 981 },
    ]);
    expect(normalized.every((region) => region.endY - region.startY >= 16)).toBe(true);
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

  it('preserves planned vertical positions when assembling regions', () => {
    const regions = [
      { id: 'header', type: 'header' as const, startY: 0, endY: 100, description: 'header' },
      { id: 'main', type: 'main' as const, startY: 100, endY: 900, description: 'main' },
    ];
    const code = assembleFrameworkRegionCode(options('react'), [
      'export function HeaderRegion() { return <header>Header</header>; }',
      'export function MainRegion() { return <main>Main</main>; }',
    ], regions);
    expect(code).toContain('top: 100');
    expect(code).toContain('minHeight: 900');
    expect(code).toContain("position: 'absolute'");
  });
});
