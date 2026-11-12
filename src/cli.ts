#!/usr/bin/env node

/**
 * CLI 工具：设计稿批量转代码
 */

import { Command } from 'commander';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, basename, extname } from 'path';
import { DesignToCode, exportFrameworkProject } from './index.js';
import { getDefaultCodegenOptions } from './config.js';

const program = new Command();

program
  .name('image2html')
  .description('将 UI 设计稿转换为前端代码')
  .version('0.1.0');

program
  .command('convert')
  .description('转换单个设计稿')
  .argument('<image>', '设计稿图片路径')
  .option('-f, --framework <framework>', '目标框架 (react/vue/html)', 'react')
  .option('-s, --style <style>', '样式方案 (tailwind/scss/css-modules/inline)', 'tailwind')
  .option('-c, --component-library <library>', '组件库 (antd/element/none，默认随框架)')
  .option('-o, --output <dir>', '输出目录', './generated')
  .option('--no-validate', '跳过视觉校验')
  .option('--no-typescript', '不使用 TypeScript')
  .option('--project', '导出完整 Vite 工程而非单个源码文件')
  .option('--extract-assets', '生成前提取并引用可复用图片资源')
  .option('--pipeline <pipeline>', '生成流程 (direct/structured)', 'direct')
  .option('--quality <quality>', '质量模式 (fast/balanced/precision)', 'balanced')
  .option('--layout <layout>', '布局生成方式 (single/segmented)', 'single')
  .action(async (image: string, options: any) => {
    try {
      const componentLibrary = options.componentLibrary || (options.framework === 'vue' ? 'element' : options.framework === 'html' ? 'none' : 'antd');
      console.log(`Converting: ${image}`);
      console.log(`Framework: ${options.framework}`);
      console.log(`Style: ${options.style}`);
      console.log(`Component Library: ${componentLibrary}`);

      // 检查文件是否存在
      if (!existsSync(image)) {
        console.error(`Error: File not found: ${image}`);
        process.exit(1);
      }

      // 创建输出目录
      if (!existsSync(options.output)) {
        await mkdir(options.output, { recursive: true });
      }

      // 初始化转换器
      const d2c = new DesignToCode();

      // 执行转换
      const result = await d2c.convert({
        image: {
          source: image,
          type: 'path',
          filename: basename(image),
        },
        options: {
          framework: options.framework,
          styleFramework: options.style,
          componentLibrary,
          typescript: options.typescript,
          responsive: true,
          accessibility: true,
          assetMode: options.extractAssets ? 'extract' : 'none',
          pipeline: options.pipeline,
          qualityMode: options.quality,
          layoutMode: options.layout,
        },
        modelConfig: (await import('./config.js')).getDefaultModelConfig(),
        validationConfig: options.validate
          ? (await import('./config.js')).getDefaultValidationConfig()
          : undefined,
      });

      // 保存结果
      if (result.success) {
        const outputPath = join(options.output, result.code.filename);
        if (options.project) {
          await exportFrameworkProject(result.code, {
            framework: options.framework,
            styleFramework: options.style,
            componentLibrary,
            typescript: options.typescript,
            responsive: true,
            accessibility: true,
          assetMode: options.extractAssets ? 'extract' : 'none',
          pipeline: options.pipeline,
          qualityMode: options.quality,
          layoutMode: options.layout,
          }, options.output);
          console.log(`\n✅ Project generated: ${options.output}`);
        } else {
          await writeFile(outputPath, result.code.code, 'utf-8');
          console.log(`\n✅ Code generated: ${outputPath}`);
        }
        console.log(`Components: ${result.code.components.join(', ')}`);

        if (result.validation) {
          console.log(`\n📊 Validation Result:`);
          console.log(`   Similarity: ${result.validation.similarity}%`);
          console.log(`   Status: ${result.validation.passed ? '✅ PASSED' : '❌ FAILED'}`);

          if (!result.validation.passed) {
            console.log(`\n⚠️  Differences found:`);
            for (const region of result.validation.regions) {
              console.log(
                `   - ${region.type}: ${region.diffPercentage}% difference at (${region.x}, ${region.y})`
              );
            }

            console.log(`\n💡 Suggestions:`);
            for (const suggestion of result.validation.suggestions) {
              console.log(`   - ${suggestion}`);
            }

            // 保存差异图片
            if (result.validation.diffImage) {
              const diffPath = join(options.output, `${basename(image, extname(image))}-diff.png`);
              await writeFile(diffPath, Buffer.from(result.validation.diffImage, 'base64'));
              console.log(`\n📸 Diff image saved: ${diffPath}`);
            }
          }
        }
      } else {
        console.error(`\n❌ Conversion failed: ${result.error}`);
        process.exit(1);
      }

      await d2c.close();
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('batch')
  .description('批量转换设计稿')
  .argument('<dir>', '设计稿目录')
  .option('-f, --framework <framework>', '目标框架 (react/vue/html)', 'react')
  .option('-s, --style <style>', '样式方案 (tailwind/scss/css-modules/inline)', 'tailwind')
  .option('-c, --component-library <library>', '组件库 (antd/element/none，默认随框架)')
  .option('-o, --output <dir>', '输出目录', './generated')
  .option('--no-validate', '跳过视觉校验')
  .option('--pipeline <pipeline>', '生成流程 (direct/structured)', 'direct')
  .option('--quality <quality>', '质量模式 (fast/balanced/precision)', 'balanced')
  .option('--layout <layout>', '布局生成方式 (single/segmented)', 'single')
  .action(async (dir: string, options: any) => {
    try {
      const { readdir } = await import('fs/promises');
      const files = await readdir(dir);
      const imageFiles = files.filter((f) => /\.(png|jpg|jpeg)$/i.test(f));

      if (imageFiles.length === 0) {
        console.error(`No image files found in: ${dir}`);
        process.exit(1);
      }

      const componentLibrary = options.componentLibrary || (options.framework === 'vue' ? 'element' : options.framework === 'html' ? 'none' : 'antd');
      console.log(`Found ${imageFiles.length} design files`);

      const results: Array<{
        file: string;
        success: boolean;
        similarity?: number;
        passed?: boolean;
      }> = [];

      for (const file of imageFiles) {
        const imagePath = join(dir, file);
        console.log(`\nProcessing: ${file}`);

        try {
          const d2c = new DesignToCode();
          const result = await d2c.convert({
            image: {
              source: imagePath,
              type: 'path',
              filename: file,
            },
            options: {
              framework: options.framework,
              styleFramework: options.style,
              componentLibrary,
              typescript: true,
              responsive: true,
              accessibility: true,
          assetMode: options.extractAssets ? 'extract' : 'none',
          pipeline: options.pipeline,
          qualityMode: options.quality,
          layoutMode: options.layout,
            },
            modelConfig: (await import('./config.js')).getDefaultModelConfig(),
            validationConfig: options.validate
              ? (await import('./config.js')).getDefaultValidationConfig()
              : undefined,
          });

          if (result.success) {
            const outputPath = join(options.output, result.code.filename);
            await writeFile(outputPath, result.code.code, 'utf-8');

            results.push({
              file,
              success: true,
              similarity: result.validation?.similarity,
              passed: result.validation?.passed,
            });

            console.log(`  ✅ Generated: ${result.code.filename}`);
            if (result.validation) {
              console.log(
                `  📊 Similarity: ${result.validation.similarity}% (${result.validation.passed ? 'PASSED' : 'FAILED'})`
              );
            }
          } else {
            results.push({
              file,
              success: false,
            });
            console.log(`  ❌ Failed: ${result.error}`);
          }

          await d2c.close();
        } catch (error) {
          results.push({
            file,
            success: false,
          });
          console.log(`  ❌ Error: ${error instanceof Error ? error.message : error}`);
        }
      }

      // 生成汇总报告
      console.log('\n' + '='.repeat(50));
      console.log('BATCH CONVERSION SUMMARY');
      console.log('='.repeat(50));

      const successCount = results.filter((r) => r.success).length;
      const passedCount = results.filter((r) => r.passed).length;

      console.log(`Total: ${results.length}`);
      console.log(`Success: ${successCount}`);
      console.log(`Failed: ${results.length - successCount}`);

      if (options.validate) {
        console.log(`Validation Passed: ${passedCount}`);
        console.log(`Validation Failed: ${successCount - passedCount}`);
      }

      // 保存报告
      const reportPath = join(options.output, 'conversion-report.json');
      await writeFile(reportPath, JSON.stringify(results, null, 2));
      console.log(`\nReport saved: ${reportPath}`);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
