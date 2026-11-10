# 测试 Demo 高保真设计稿

本目录包含用于测试 image2html 工具的高保真 UI 设计稿。

## 设计稿列表

| 文件名 | 类型 | 描述 | 复杂度 |
|--------|------|------|--------|
| `ecommerce-shop.png` | 小商城 | 电商首页，包含导航、分类、商品卡片 | ⭐⭐⭐ |
| `content-platform.png` | 内容发布平台 | 内容编辑器，包含表单、工具栏、侧边栏 | ⭐⭐⭐ |
| `dashboard.png` | 管理后台 | Dashboard，包含统计卡片、图表、表格 | ⭐⭐⭐⭐ |
| `points-mall-design.png` | 积分商城 | 移动端积分商城，包含商品网格、底部导航 | ⭐⭐⭐ |
| `login-design.png` | 登录页 | 简单登录表单 | ⭐ |

## 使用方法

### 命令行测试

```bash
# 测试小商城
node dist/cli.js convert examples/fixtures/demo/ecommerce-shop.png -f html -o output

# 测试内容发布平台
node dist/cli.js convert examples/fixtures/demo/content-platform.png -f react -o output

# 测试管理后台
node dist/cli.js convert examples/fixtures/demo/dashboard.png -f react -o output

# 批量测试所有 demo
node dist/cli.js batch examples/fixtures/demo -f html -o output
```

### 编程方式测试

```typescript
import { DesignToCode } from '../src/index.js';

const d2c = new DesignToCode();

// 测试小商城
const result = await d2c.convert({
  image: {
    source: 'examples/fixtures/demo/ecommerce-shop.png',
    type: 'path',
  },
  options: {
    framework: 'html',
    styleFramework: 'inline',
    componentLibrary: 'none',
    typescript: false,
    responsive: true,
    accessibility: true,
  },
  modelConfig: getDefaultModelConfig(),
  validationConfig: getDefaultValidationConfig(),
});

console.log('相似度:', result.validation?.similarity);
```

### MCP 工具测试

在 OpenCode 中：

```
用户：@design-to-code 请根据 examples/fixtures/demo/ecommerce-shop.png 生成 HTML 代码
```

## 预期结果

| 设计稿 | 预期相似度 | 说明 |
|--------|-----------|------|
| 登录页 | ≥ 90% | 简单页面，容易还原 |
| 积分商城 | ≥ 85% | 移动端布局，组件较多 |
| 小商城 | ≥ 85% | 电商布局，卡片式组件 |
| 内容发布平台 | ≥ 85% | 表单和编辑器布局 |
| 管理后台 | ≥ 80% | 复杂布局，包含图表和表格 |

## 文件说明

- `*.png` - 高保真设计稿截图（用于测试输入）
- `*.html` - 设计稿的 HTML 源代码（用于参考和重新生成截图）

## 重新生成截图

如果需要修改设计稿，可以编辑 HTML 文件后重新截图：

```bash
node --input-type=module -e "
import { chromium } from 'playwright';
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('file:///F:/code/image2html/examples/fixtures/demo/ecommerce-shop.html');
await page.screenshot({ path: 'examples/fixtures/demo/ecommerce-shop.png', fullPage: true });
await browser.close();
"
```

## 贡献

欢迎添加更多类型的高保真设计稿作为测试 demo，建议：

1. 覆盖不同的页面类型（表单、列表、详情、仪表板等）
2. 包含不同的布局复杂度
3. 支持不同的设备尺寸（移动端、平板、桌面）
4. 使用不同的配色方案和设计风格
