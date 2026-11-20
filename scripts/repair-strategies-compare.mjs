import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { DesignToCode } from '../dist/index.js';
import { getDefaultCodegenOptions, getDefaultModelConfig, getDefaultValidationConfig } from '../dist/config.js';
import { createVisionClient } from '../dist/llm/client.js';
import { buildTextExtractionPrompt, parseVisibleTexts } from '../dist/prompts/text-extraction.js';
import { applyCodeEdits, parseCodeEdits } from '../dist/codegen/patch-applier.js';

const [imagePath, failedDir, framework = 'react', outputDir = 'output/strategies-compare'] = process.argv.slice(2);
if (!imagePath || !failedDir) throw new Error('Usage: node scripts/repair-strategies-compare.mjs <image> <failed-dir> [react|vue] [output-dir]');
const ENABLED = (process.env.REPAIR_STRATEGIES || 'B,C,D,E').split(',');

const filename = framework === 'react' ? 'Generatedpage.tsx' : 'Generatedpage.vue';
const options = {
  ...getDefaultCodegenOptions(),
  framework,
  styleFramework: framework === 'react' ? 'tailwind' : 'inline',
  componentLibrary: framework === 'react' ? 'antd' : 'element',
  typescript: true,
  qualityMode: 'precision',
  assetMode: 'none',
};

const KNOWN_ISSUES = `## 已知重点问题（按对视觉评分的影响排序）
1. 根 Layout 使用了 h-screen（固定 100vh），在 900px 高的桌面视口下订单表格等内容被裁剪。请移除固定视口高度（改为 min-h-screen），让文档高度随内容自然撑开，4 行订单全部可见。
2. 「销售趋势」和「商品分类占比」卡片内应有占据卡片绝大部分空间的大型浅灰圆角占位块；当前只有一个小图标加文字。
3. 侧边栏激活菜单项应为白底蓝字，当前是蓝底白字（antd Menu 请用合法属性实现）。
4. 文字与原图存在系统性偏移：校准字号、行高与间距。
5. antd Table 分页器的 showTotal 必须是函数（如 showTotal={() => ''}），传 boolean 会导致 TypeScript 编译失败。`;

const imageBuffer = await readFile(imagePath);
const imageBase64 = imageBuffer.toString('base64');
const initialCode = await readFile(join(failedDir, filename), 'utf8');

const converter = new DesignToCode({ modelConfig: getDefaultModelConfig(), validationConfig: getDefaultValidationConfig() });
const vision = createVisionClient(getDefaultModelConfig());
await mkdir(outputDir, { recursive: true });

const score = (v) => v.quality?.qualityScore ?? v.similarity;
const describe = (v) => `quality=${score(v)} (edge=${v.quality?.edgeSimilarity})`;
const cleanCode = (raw) => raw.trim().replace(/^```\w*\n/, '').replace(/\n```$/, '');
const compileNote = (e) => e.message.split('\n').slice(0, 2).join('; ').slice(0, 300);

async function extractTexts() {
  const raw = await vision.generateWithImages(buildTextExtractionPrompt(), [imageBase64], { temperature: 0, maxTokens: 4096 });
  try { return parseVisibleTexts(raw); } catch { return []; }
}

async function markRegions(base64, regions, limit = 5) {
  const top = [...regions].sort((a, b) => b.diffPixels - a.diffPixels).slice(0, limit);
  const meta = await sharp(Buffer.from(base64, 'base64')).metadata();
  const w = meta.width, h = meta.height;
  const parts = top.map((r, i) => {
    const cx = Math.min(w - 20, Math.max(20, r.x + r.width / 2));
    const cy = Math.min(h - 20, Math.max(20, r.y + r.height / 2));
    return `<circle cx="${cx}" cy="${cy}" r="18" fill="#e11d48" stroke="#fff" stroke-width="3"/><text x="${cx}" y="${cy + 7}" font-size="22" font-family="sans-serif" font-weight="bold" fill="#fff" text-anchor="middle">${i + 1}</text>`;
  });
  const svg = Buffer.from(`<svg width="${w}" height="${h}">${parts.join('')}</svg>`);
  const marked = await sharp(Buffer.from(base64, 'base64')).composite([{ input: svg }]).png().toBuffer();
  return {
    base64: marked.toString('base64'),
    legend: top.map((r, i) => `#${i + 1}: ${r.type} 区域 (${r.x},${r.y} ${r.width}x${r.height}, 差异 ${r.diffPercentage}%)`),
  };
}

function revisionPrompt({ intro, imageNote, marked, bestCode, best, texts }) {
  return `${intro}

## Reference Webpage${imageNote}:
(image 1)

## Current Webpage:
(image 2)

${marked ? `## Marked regions:\n${marked.legend.join('\n')}\n\n` : ''}## All text content that must appear exactly as in the reference:
${texts.map((t) => `- ${t}`).join('\n')}

${KNOWN_ISSUES}

## Current code:
${bestCode}

Respond directly with the complete revised ${filename} file. No explanations, no markdown fences.`;
}

async function run() {
  const texts = await extractTexts();
  console.log(`[setup] extracted ${texts.length} text items from reference`);

  const base = { code: initialCode, filename, imports: [], components: [] };
  const initial = await converter.validate(imageBuffer, base, options);
  console.log(`[baseline] ${describe(initial)}`);
  const results = { baseline: score(initial), strategies: {} };

  async function saveStrategy(name, code, validation) {
    const dir = join(outputDir, name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, filename), code, 'utf8');
    await writeFile(join(dir, 'validation.json'), JSON.stringify(validation.quality, null, 2));
    await writeFile(join(dir, 'rendered.png'), Buffer.from(validation.screenshots.desktop, 'base64'));
    results.strategies[name] = { score: score(validation), passed: validation.passed };
    console.log(`[${name}] final ${describe(validation)}`);
  }

  async function validateOrNull(candidate) {
    try {
      return await converter.validate(imageBuffer, { ...base, code: candidate }, options);
    } catch (e) {
      return { error: compileNote(e) };
    }
  }

  const worstRegions = (v, n = 3) => [...(v.regions || [])].sort((a, b) => b.diffPixels - a.diffPixels).slice(0, n)
    .map((r, i) => `#${i + 1} ${r.type} @(${r.x},${r.y}) ${r.diffPercentage}%`).join('; ');

  // 批处理整文件修订（B：双图模板；C：+ 布局标记）
  async function batchRevision(name, useMarkers, iterations) {
    let bestCode = initialCode, best = initial;
    for (let iter = 1; iter <= iterations; iter += 1) {
      const marked = useMarkers ? await markRegions(imageBase64, best.regions) : null;
      const prompt = revisionPrompt({
        intro: `You are an expert web developer who specializes in ${framework} and ${options.componentLibrary}. I will show you two webpages. Revise the code so that the current webpage looks exactly like the reference webpage.`,
        imageNote: useMarkers ? ' (with numbered red markers on the regions that differ most)' : '',
        marked, bestCode, best, texts,
      });
      const startedAt = Date.now();
      const raw = await vision.generateWithImages(prompt, [marked ? marked.base64 : imageBase64, best.screenshots.desktop], { temperature: 0, maxTokens: 16384 });
      const v = await validateOrNull(cleanCode(raw));
      if (v.error) {
        console.log(`[${name}] iter ${iter} compile failed: ${v.error} (${((Date.now() - startedAt) / 1000).toFixed(0)}s)`);
        continue;
      }
      const improved = score(v) >= score(best) + 0.05;
      console.log(`[${name}] iter ${iter}: ${describe(v)} [${improved ? 'ADOPTED' : 'rejected'}, ${((Date.now() - startedAt) / 1000).toFixed(0)}s]`);
      if (improved) { bestCode = cleanCode(raw); best = v; }
    }
    await saveStrategy(name, bestCode, best);
  }

  // 多轮 agent（D：JSON 补丁；E：整文件输出）
  async function agentic(name, usePatches, iterations, turns) {
    let bestCode = initialCode, best = initial;
    for (let iter = 1; iter <= iterations; iter += 1) {
      const marked = await markRegions(imageBase64, best.regions);
      const outputRule = usePatches
        ? 'Output ONLY JSON: {"edits":[{"oldText":"...","newText":"...","reason":"..."}]}. oldText must match the current code verbatim.'
        : `Respond with the complete revised ${filename} only. No explanations, no markdown fences.`;
      const firstPrompt = `You are an expert front-end developer fixing visual differences turn by turn. Each turn you output a fix, the user applies it, renders the page, and shows you the result with the worst remaining diff regions. You then decide whether to continue or signal completion.

## Reference Webpage (numbered markers = worst diff regions):
(image 1)

## Current Webpage:
(image 2)

## Marked regions:
${marked.legend.join('\n')}

## All text content that must appear exactly:
${texts.map((t) => `- ${t}`).join('\n')}

${KNOWN_ISSUES}

## Current code:
${bestCode}

${outputRule}`;
      const messages = [{ role: 'user', content: [
        { type: 'text', text: firstPrompt },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${marked.base64}` } },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${best.screenshots.desktop}` } },
      ] }];
      let turnCode = bestCode, turnBest = best, adopted = false;
      for (let turn = 1; turn <= turns; turn += 1) {
        const startedAt = Date.now();
        const reply = await vision.chatCompletion(messages, { temperature: 0.1, maxTokens: 16384 });
        const text = reply.choices[0]?.message?.content || '';
        messages.push({ role: 'assistant', content: text });
        let candidate;
        if (usePatches) {
          try {
            candidate = applyCodeEdits(turnCode, parseCodeEdits(text)).code;
          } catch (e) {
            messages.push({ role: 'user', content: `Your patch failed to apply: ${compileNote(e)}. Re-output the full JSON patch with exact oldText.` });
            console.log(`[${name}] iter ${iter} turn ${turn}: patch failed, nudging (${((Date.now() - startedAt) / 1000).toFixed(0)}s)`);
            continue;
          }
          if (candidate === turnCode) {
            console.log(`[${name}] iter ${iter} turn ${turn}: model signaled done (${((Date.now() - startedAt) / 1000).toFixed(0)}s)`);
            break;
          }
        } else {
          candidate = cleanCode(text);
          if (/^\s*(DONE|done|完成)\s*$/.test(candidate) || (candidate.length < 500 && !candidate.includes('return'))) {
            console.log(`[${name}] iter ${iter} turn ${turn}: model signaled done (${((Date.now() - startedAt) / 1000).toFixed(0)}s)`);
            break;
          }
        }
        const v = await validateOrNull(candidate);
        if (v.error) {
          messages.push({ role: 'user', content: `That change broke compilation: ${v.error}. Output a fixed version.` });
          console.log(`[${name}] iter ${iter} turn ${turn}: compile error fed back (${((Date.now() - startedAt) / 1000).toFixed(0)}s)`);
          continue;
        }
        console.log(`[${name}] iter ${iter} turn ${turn}: ${describe(v)} (${((Date.now() - startedAt) / 1000).toFixed(0)}s)`);
        turnCode = candidate; turnBest = v;
        if (score(v) >= score(best) + 0.05) adopted = true;
        messages.push({ role: 'user', content: [
          { type: 'text', text: `Rendered. New quality=${score(v)} (edge=${v.quality?.edgeSimilarity}). Worst remaining regions: ${worstRegions(v)}. If satisfied, signal completion; otherwise continue with the next fix.` },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${v.screenshots.desktop}` } },
        ] });
      }
      console.log(`[${name}] iter ${iter} done, adopted=${adopted}`);
      if (adopted) { bestCode = turnCode; best = turnBest; }
    }
    await saveStrategy(name, bestCode, best);
  }

  const iters = parseInt(process.env.REPAIR_ITERS || '3', 10);
  if (ENABLED.includes('B')) await batchRevision('B-revision-prompt', false, iters);
  if (ENABLED.includes('C')) await batchRevision('C-marked-regions', true, iters);
  if (ENABLED.includes('D')) await agentic('D-agentic-multiturn', true, 2, 3);
  if (ENABLED.includes('E')) await agentic('E-agentic-fullfile', false, 2, 3);

  await writeFile(join(outputDir, 'summary.json'), JSON.stringify(results, null, 2));
  console.log('summary:', JSON.stringify(results));
}

try {
  await run();
} catch (e) {
  console.error(`[compare] failed: ${e.message}`);
  process.exitCode = 1;
} finally {
  await converter.close();
}
