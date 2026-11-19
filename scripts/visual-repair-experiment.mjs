import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DesignToCode } from '../dist/index.js';
import { getDefaultCodegenOptions, getDefaultModelConfig, getDefaultValidationConfig } from '../dist/config.js';
import { createVisionClient } from '../dist/llm/client.js';
import { buildVisualPatchPrompt, buildVisualRepairPrompt } from '../dist/prompts/direct-generation.js';
import { applyCodeEdits, parseCodeEdits } from '../dist/codegen/patch-applier.js';

const [imagePath, failedDir, framework = 'react', outputDir = `${failedDir}-vision-repaired`, maxIterationsArg] = process.argv.slice(2);
const maxIterations = Math.max(1, parseInt(maxIterationsArg || '4', 10));

if (!imagePath || !failedDir || !['react', 'vue'].includes(framework)) {
  throw new Error('Usage: node scripts/visual-repair-experiment.mjs <image> <failed-dir> <react|vue> [output-dir] [maxIterations]');
}

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

const KNOWN_ISSUES = `

## 重点已知问题（人工分析 diff 得出，按对视觉评分的影响排序）
1. 根 Layout 使用了 h-screen（固定 100vh 视口高度），在 900px 高的桌面视口下订单表格等内容被裁剪（只显示 1 行）。原图是 1440x1127 的静态页面，请移除固定视口高度（改为 min-h-screen 或去掉高度类），让文档高度随内容自然撑开，4 行订单全部可见。
2. 「销售趋势」和「商品分类占比」两张卡片内，原图是占据卡片绝大部分空间的大型浅灰色圆角占位块（图表占位区域）；当前只有一个小图标加一行说明文字。请在两张卡片内添加占据内容区绝大部分空间的大块浅灰（接近 #f5f5f5）圆角占位区域。
3. 侧边栏当前激活菜单项（数据概览）应为白色背景 + 蓝色文字，当前是蓝色背景 + 白色文字。请使用 antd Menu 合法的方式实现（theme/style/受控 selectedKeys），不要杜撰不存在的属性（如 itemStyle 会导致 TS 编译错误）。
4. 所有文字与原图存在系统性偏移：请对照布局快照中的 bounds 校准标题与数值的字号、行高与间距。
优先修复第 1、2 条，它们对评分影响最大。`;

const imageBuffer = await readFile(imagePath);
const imageBase64 = imageBuffer.toString('base64');
let code = {
  code: await readFile(join(failedDir, filename), 'utf8'),
  filename,
  imports: [],
  components: [],
};

const converter = new DesignToCode({ modelConfig: getDefaultModelConfig(), validationConfig: getDefaultValidationConfig() });
const visionClient = createVisionClient(getDefaultModelConfig());
await mkdir(outputDir, { recursive: true });

const score = (v) => v.quality?.qualityScore ?? v.similarity;
const describe = (v) => `quality=${score(v)} (overall=${v.quality?.overallSimilarity}, content=${v.quality?.contentSimilarity}, edge=${v.quality?.edgeSimilarity}), similarity=${v.similarity}, passed=${v.passed}`;

const history = [];
try {
  console.log('[experiment] validating initial code');
  let bestValidation = await converter.validate(imageBuffer, code, options);
  console.log(`[experiment] initial: ${describe(bestValidation)}`);
  history.push({ iteration: 0, score: score(bestValidation), adopted: true });
  let lastCompileError = null;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    if (bestValidation.passed) break;
    const focusRegion = [...bestValidation.regions].sort((a, b) => b.diffPixels - a.diffPixels)[0];
    const promptInput = {
      currentCode: code.code,
      options,
      suggestions: bestValidation.suggestions,
      layout: bestValidation.layout,
      focusRegion,
      regions: bestValidation.regions.map((r) => ({ type: r.type, diffPercentage: r.diffPercentage })),
    };
    const images = [imageBase64, bestValidation.screenshots.desktop, bestValidation.diffImage].filter(Boolean);
    const compileNote = lastCompileError ? `\n注意：上一轮候选代码存在编译错误，本轮必须避免：${lastCompileError}\n` : '';

    console.log(`[experiment] iteration ${iteration}/${maxIterations}: vision repair (${images.length} full images, focus=${focusRegion?.type})`);
    const startedAt = Date.now();
    let candidateCode;
    let patchError = null;
    for (let patchAttempt = 1; patchAttempt <= 2; patchAttempt += 1) {
      try {
        const prompt = (patchAttempt === 1 ? '' : `上一次补丁中的 oldText 在代码中未找到，请修正后重新输出完整 JSON。\n失败详情：${patchError.message}\n\n`)
          + compileNote + buildVisualPatchPrompt(promptInput) + KNOWN_ISSUES;
        const patched = await visionClient.generateWithImages(prompt, images, { temperature: 0.1, maxTokens: 16384 });
        candidateCode = applyCodeEdits(code.code, parseCodeEdits(patched)).code;
        patchError = null;
        break;
      } catch (error) {
        patchError = error;
        console.warn(`[experiment] patch attempt ${patchAttempt} failed: ${error.message.split('\n')[0]}`);
      }
    }
    if (patchError) {
      console.warn('[experiment] patch retries exhausted; falling back to full-code repair');
      const candidate = await visionClient.generateWithImages(
        compileNote + buildVisualRepairPrompt(promptInput) + KNOWN_ISSUES,
        images,
        { temperature: 0.1, maxTokens: 16384 }
      );
      candidateCode = candidate.trim().replace(/^```\w*\n/, '').replace(/\n```$/, '');
    }
    await writeFile(join(outputDir, `candidate-iter${iteration}.tsx`), candidateCode, 'utf8');

    let candidateValidation;
    try {
      candidateValidation = await converter.validate(imageBuffer, { ...code, code: candidateCode }, options);
      lastCompileError = null;
    } catch (validateError) {
      // 候选代码编译/运行失败：记为 rejected，带诊断进入下一轮
      lastCompileError = validateError.message.split('\n').slice(0, 3).join('; ');
      console.log(`[experiment] candidate failed to compile/run: ${lastCompileError} [rejected, ${((Date.now() - startedAt) / 1000).toFixed(0)}s]`);
      history.push({ iteration, score: null, adopted: false, error: lastCompileError });
      continue;
    }

    const improved = score(candidateValidation) >= score(bestValidation) + 0.05;
    console.log(`[experiment] candidate: ${describe(candidateValidation)} [${improved ? 'ADOPTED' : 'rejected'}, ${((Date.now() - startedAt) / 1000).toFixed(0)}s]`);
    history.push({ iteration, score: score(candidateValidation), adopted: improved });

    if (improved) {
      code = { ...code, code: candidateCode };
      bestValidation = candidateValidation;
    }
  }

  await writeFile(join(outputDir, filename), code.code, 'utf8');
  await writeFile(join(outputDir, 'validation.json'), JSON.stringify(bestValidation, null, 2));
  await writeFile(join(outputDir, 'rendered.png'), Buffer.from(bestValidation.screenshots.desktop, 'base64'));
  await writeFile(join(outputDir, 'diff.png'), Buffer.from(bestValidation.diffImage, 'base64'));
  await writeFile(join(outputDir, 'summary.json'), JSON.stringify({
    framework,
    sourceDir: failedDir,
    final: describe(bestValidation),
    history,
  }, null, 2));
  console.log(`[experiment] done. artifacts in ${outputDir}`);
} catch (error) {
  console.error(`[experiment] failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await converter.close();
}
