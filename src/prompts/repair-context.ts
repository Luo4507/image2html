import type {
  DiffRegion,
  LayoutElementSnapshot,
  LayoutSnapshot,
  ValidationConfig,
  ValidationResult,
  VisualQualityMetrics,
} from '../types.js';

export type RepairQualityConfig = Pick<
  ValidationConfig,
  'threshold' | 'minContentSimilarity' | 'minEdgeSimilarity' | 'checkTextCoverage' | 'minTextCoverage'
>;

interface RepairQualityInput {
  similarity?: number;
  quality?: VisualQualityMetrics;
  textCoverage?: number;
  missingTexts?: string[];
}

function focusedElements(layout?: LayoutSnapshot, focusRegion?: DiffRegion): LayoutElementSnapshot[] {
  if (!layout) return [];
  if (!focusRegion) return layout.elements.slice(0, 24);
  const marginX = Math.max(32, focusRegion.width * 0.2);
  const marginY = Math.max(32, focusRegion.height * 0.2);
  const left = focusRegion.x - marginX;
  const top = focusRegion.y - marginY;
  const right = focusRegion.x + focusRegion.width + marginX;
  const bottom = focusRegion.y + focusRegion.height + marginY;
  const intersecting = layout.elements.filter((element) => {
    const bounds = element.bounds;
    return bounds.x <= right && bounds.x + bounds.width >= left &&
      bounds.y <= bottom && bounds.y + bounds.height >= top;
  });
  return (intersecting.length > 0 ? intersecting : layout.elements).slice(0, 24);
}

/** Keep only browser measurements that can explain the current worst region. */
export function buildFocusedLayoutPrompt(
  layout?: LayoutSnapshot,
  focusRegion?: DiffRegion
): string {
  if (!layout) return '';
  const snapshot = {
    viewport: layout.viewport,
    document: layout.document,
    focusRegion,
    elements: focusedElements(layout, focusRegion),
  };
  return `## 相关 DOM 布局与计算样式\n仅保留问题区域及邻近元素，坐标均基于主视口：\n${JSON.stringify(snapshot)}`;
}

/** Add only failed quality gates to the prompt, leaving passed areas untouched. */
export function buildRepairObjectives(
  input: RepairQualityInput,
  config?: RepairQualityConfig
): string {
  if (!config) return '';
  const quality = input.quality;
  const objectives: string[] = [];
  const directives: string[] = [];
  const overall = quality?.overallSimilarity ?? input.similarity;

  if (overall !== undefined && overall < config.threshold) {
    objectives.push(`整图相似度 ${overall.toFixed(2)}%，要求至少 ${config.threshold}%`);
    directives.push('优先消除最大差异区域的布局、位置和尺寸偏差。');
  }
  if (quality && quality.contentSimilarity < config.minContentSimilarity) {
    objectives.push(`内容相似度 ${quality.contentSimilarity.toFixed(2)}%，要求至少 ${config.minContentSimilarity}%`);
    directives.push('集中修复前景内容、文字排版、颜色、间距和缺失元素。');
  }
  if (quality && quality.edgeSimilarity < config.minEdgeSimilarity) {
    objectives.push(`边缘相似度 ${quality.edgeSimilarity.toFixed(2)}%，要求至少 ${config.minEdgeSimilarity}%`);
    directives.push('集中修复元素边界、分割线、圆角、图标和轮廓；保持已通过的整体布局与内容不变。');
  }
  if (
    config.checkTextCoverage && input.textCoverage !== undefined &&
    input.textCoverage < (config.minTextCoverage ?? 80)
  ) {
    objectives.push(`文字覆盖率 ${input.textCoverage.toFixed(2)}%，要求至少 ${config.minTextCoverage ?? 80}%`);
    directives.push(`恢复原图文字，不得编造或遗漏；当前缺失：${JSON.stringify((input.missingTexts || []).slice(0, 20))}`);
  }
  if (objectives.length === 0) return '';

  return `## 本轮定向验收目标
只针对以下未通过项做最小修改，不要重设计已通过的区域：
${objectives.map((item) => `- ${item}`).join('\n')}

${directives.map((item) => `- ${item}`).join('\n')}`;
}

function selectorTokens(elements: LayoutElementSnapshot[]): string[] {
  const tokens = new Set<string>();
  for (const element of elements) {
    const selector = element.selector.replace(/#\d+$/, '');
    for (const match of selector.matchAll(/[.#]([A-Za-z_][\w-]*)/g)) {
      tokens.add(match[1]);
    }
  }
  return [...tokens];
}

/**
 * Large files are reduced to exact source excerpts for patch generation.
 * Full-code fallback still receives the original source, not these excerpts.
 */
export function buildPatchCodeContext(
  currentCode: string,
  layout?: LayoutSnapshot,
  focusRegion?: DiffRegion
): string {
  if (currentCode.length <= 24_000) return currentCode;

  const ranges: Array<{ start: number; end: number }> = [{
    start: 0,
    end: Math.min(1_200, currentCode.length),
  }];
  for (const token of selectorTokens(focusedElements(layout, focusRegion))) {
    let from = 0;
    let matches = 0;
    while (matches < 3) {
      const index = currentCode.indexOf(token, from);
      if (index < 0) break;
      ranges.push({
        start: Math.max(0, index - 900),
        end: Math.min(currentCode.length, index + token.length + 1_500),
      });
      from = index + token.length;
      matches += 1;
    }
  }

  ranges.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end + 80) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  if (merged.length === 1) {
    merged.push({ start: Math.max(merged[0].end, currentCode.length - 6_000), end: currentCode.length });
  }

  const excerpts: string[] = [];
  let remaining = 18_000;
  for (const range of merged) {
    if (remaining <= 0) break;
    const source = currentCode.slice(range.start, range.end);
    excerpts.push(source.slice(0, remaining));
    remaining -= source.length;
  }
  return `${excerpts.join('\n\n…[无关代码已省略]…\n\n')}\n\n[补丁上下文说明：以上为大文件的相关源码片段；oldText 必须逐字取自片段，不得包含省略标记。]`;
}
