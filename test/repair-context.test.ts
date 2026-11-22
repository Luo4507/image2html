import { describe, expect, it } from 'vitest';
import {
  buildFocusedLayoutPrompt,
  buildPatchCodeContext,
  buildRepairObjectives,
} from '../src/prompts/repair-context.js';
import {
  buildVisualPatchPrompt,
  buildVisualRepairPrompt,
} from '../src/prompts/direct-generation.js';
import type { DiffRegion, LayoutSnapshot } from '../src/types.js';

const qualityConfig = {
  threshold: 85,
  minContentSimilarity: 60,
  minEdgeSimilarity: 40,
  checkTextCoverage: true,
  minTextCoverage: 80,
};

const focusRegion: DiffRegion = {
  x: 100,
  y: 100,
  width: 100,
  height: 80,
  diffPercentage: 50,
  diffPixels: 4000,
  type: 'main',
};

function element(selector: string, y: number) {
  return {
    selector,
    tagName: 'section',
    bounds: { x: 100, y, width: 100, height: 40 },
    styles: {
      color: 'rgb(0, 0, 0)', backgroundColor: 'rgb(255, 255, 255)',
      fontSize: '14px', fontWeight: '400', padding: '0px', margin: '0px',
      gap: 'normal', borderRadius: '0px',
    },
  };
}

describe('focused repair context', () => {
  it('targets only failed quality gates and preserves passed dimensions', () => {
    const result = buildRepairObjectives({
      similarity: 93,
      quality: {
        overallSimilarity: 90,
        contentSimilarity: 80,
        edgeSimilarity: 20,
        contentRatio: 1,
        qualityScore: 70,
        textCoverage: 100,
      },
      textCoverage: 100,
    }, qualityConfig);

    expect(result).toContain('边缘相似度 20.00%');
    expect(result).toContain('保持已通过的整体布局与内容不变');
    expect(result).not.toContain('整图相似度');
    expect(result).not.toContain('内容相似度 80.00%');
    expect(result).not.toContain('文字覆盖率');
  });

  it('includes exact missing text only when the text gate fails', () => {
    const result = buildRepairObjectives({
      similarity: 90,
      textCoverage: 60,
      missingTexts: ['立即登录', '不应该出现在其他轮次'],
    }, qualityConfig);
    expect(result).toContain('文字覆盖率 60.00%');
    expect(result).toContain('立即登录');
  });

  it('limits DOM context to the focus region and its neighbors', () => {
    const layout: LayoutSnapshot = {
      viewport: { width: 500, height: 500 },
      document: { width: 500, height: 2000 },
      elements: [
        element('section.near-card#0', 110),
        element('section.near-title#1', 160),
        ...Array.from({ length: 30 }, (_, index) => element(`section.far-${index}#${index + 2}`, 1000 + index * 50)),
      ],
    };
    const result = buildFocusedLayoutPrompt(layout, focusRegion);
    expect(result).toContain('near-card');
    expect(result).toContain('near-title');
    expect(result).not.toContain('far-0');
  });

  it('uses exact excerpts for large patches but complete source for full repair', () => {
    const target = '<section class="feed-card"><h3>Target title</h3></section>';
    const currentCode = `<html><style>.base { color: black; }</style><body>${target}${'<p>unrelated</p>'.repeat(2_000)}</body></html>`;
    const layout: LayoutSnapshot = {
      viewport: { width: 500, height: 500 },
      document: { width: 500, height: 2000 },
      elements: [element('section.feed-card#0', 110)],
    };
    const patchContext = buildPatchCodeContext(currentCode, layout, focusRegion);
    expect(currentCode.length).toBeGreaterThan(24_000);
    expect(patchContext.length).toBeLessThan(currentCode.length);
    expect(patchContext).toContain(target);
    expect(patchContext).toContain('oldText 必须逐字取自片段');

    const input = {
      currentCode,
      suggestions: [],
      regions: [],
      layout,
      focusRegion,
    };
    expect(buildVisualPatchPrompt(input)).toContain('无关代码已省略');
    expect(buildVisualRepairPrompt(input)).toContain(currentCode);
  });
});
