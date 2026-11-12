import { describe, expect, it } from 'vitest';
import { parseRegionPlan } from '../src/prompts/region-planning.js';
import { assembleHtmlDocument } from '../src/segmented-generator.js';

describe('segmented generation', () => {
  it('parses and orders a compact region plan', () => {
    const plan = parseRegionPlan(`{"regions":[
      {"id":"main","type":"main","startY":200,"endY":800,"description":"main"},
      {"id":"header","type":"header","startY":0,"endY":200,"description":"header"}
    ]}`);

    expect(plan.map((region) => region.id)).toEqual(['header', 'main']);
  });

  it('assembles region fragments into a complete HTML document', () => {
    const html = assembleHtmlDocument('Demo', [
      '<header>Header</header>',
      '<main>Main</main>',
    ]);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<header>Header</header>');
    expect(html).toContain('<main>Main</main>');
  });
});
