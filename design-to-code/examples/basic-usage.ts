/**
 * 基础使用示例
 */

import { DesignToCode } from '../src/index.js';
import { readFile } from 'fs/promises';

async function main() {
  // 初始化转换器
  const d2c = new DesignToCode({
    modelConfig: {
      visionModel: {
        baseUrl: 'http://qwen-vl.internal:8000/v1',
        model: 'qwen3.5-vl-72b-instruct',
        apiKey: 'your-api-key',
      },
      codeModel: {
        baseUrl: 'http://glm.internal:8001/v1',
        model: 'glm-5.3',
        apiKey: 'your-api-key',
      },
    },
  });

  try {
    // 读取设计稿
    const imageBuffer = await readFile('./examples/login-design.png');
    const imageBase64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;

    // 执行转换
    const result = await d2c.convert({
      image: {
        source: imageBase64,
        type: 'base64',
        filename: 'login-design.png',
      },
      options: {
        framework: 'react',
        styleFramework: 'tailwind',
        componentLibrary: 'antd',
        typescript: true,
        responsive: true,
        accessibility: true,
      },
      modelConfig: {
        visionModel: {
          baseUrl: 'http://qwen-vl.internal:8000/v1',
          model: 'qwen3.5-vl-72b-instruct',
          apiKey: 'your-api-key',
        },
        codeModel: {
          baseUrl: 'http://glm.internal:8001/v1',
          model: 'glm-5.3',
          apiKey: 'your-api-key',
        },
      },
      validationConfig: {
        threshold: 85.0,
        viewports: {
          desktop: { width: 1440, height: 900 },
          tablet: { width: 768, height: 1024 },
          mobile: { width: 375, height: 812 },
        },
        maxRetryCount: 3,
      },
    });

    // 输出结果
    if (result.success) {
      console.log('✅ 转换成功！');
      console.log('\n📄 生成的文件:', result.code.filename);
      console.log('📦 包含组件:', result.code.components.join(', '));
      console.log('📥 导入依赖:', result.code.imports.join(', '));

      console.log('\n💻 生成的代码:\n');
      console.log(result.code.code);

      if (result.validation) {
        console.log('\n📊 视觉校验结果:');
        console.log(`   相似度: ${result.validation.similarity}%`);
        console.log(`   状态: ${result.validation.passed ? '✅ 通过' : '❌ 未通过'}`);

        if (!result.validation.passed) {
          console.log('\n⚠️ 差异区域:');
          for (const region of result.validation.regions) {
            console.log(
              `   - ${region.type}: ${region.diffPercentage}% 差异 (${region.x}, ${region.y})`
            );
          }

          console.log('\n💡 修复建议:');
          for (const suggestion of result.validation.suggestions) {
            console.log(`   - ${suggestion}`);
          }
        }
      }
    } else {
      console.error('❌ 转换失败:', result.error);
    }
  } catch (error) {
    console.error('执行出错:', error);
  } finally {
    await d2c.close();
  }
}

main().catch(console.error);
