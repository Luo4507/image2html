# image2html

将高保真 UI 设计稿转换为 HTML、React 或 Vue 代码，并通过浏览器截图和像素对比自动检查视觉还原度。支持作为 Node.js 库、CLI 和 MCP Server 使用，可接入 OpenCode、Cursor 等 AI 开发工具。

## 功能

- 使用视觉模型识别页面区域、组件、排版和 Design Token
- 使用通用语言模型生成 HTML、React 或 Vue 代码
- 将硬编码样式映射为 CSS 变量，并映射常用组件库
- 使用 Playwright 和 Pixelmatch 输出相似度、差异区域及对比图
- 通过 MCP 提供生成、校验、修复和结构分析工具

## 环境要求

- Node.js 20+
- pnpm 10+
- 兼容 OpenAI Chat Completions API 的视觉模型和代码模型
- Chromium，或通过 `PLAYWRIGHT_EXECUTABLE_PATH` 指定本机 Chrome

## 快速开始

```bash
git clone https://github.com/Luo4507/image2html.git
cd image2html
pnpm install
cp .env.example .env
```

编辑 `.env`，配置模型服务。不要将 `.env` 提交到版本库。

```env
QWEN_VL_BASE_URL=http://vision-model.internal/v1
QWEN_VL_API_KEY=replace-me
VISION_MODEL=qwen-vl-plus

GLM_BASE_URL=http://code-model.internal/v1
GLM_API_KEY=replace-me
CODE_MODEL=qwen-flash

VISUAL_SIMILARITY_THRESHOLD=85.0
MAX_RETRY_COUNT=1
DEFAULT_FRAMEWORK=html
DEFAULT_STYLE_FRAMEWORK=inline
DEFAULT_COMPONENT_LIBRARY=none
```

安装 Chromium（使用本机 Chrome 时可跳过）：

```bash
npx playwright install chromium
```

构建并检查：

```bash
pnpm typecheck
pnpm test
pnpm build
```

## 使用方式

### CLI

```bash
# 单个设计稿
node dist/cli.js convert examples/fixtures/points-mall-design.png \
  --framework html --style inline --component-library none --output output

# 批量处理目录
node dist/cli.js batch examples/fixtures --framework html --output output
```

### MCP Server

```bash
pnpm mcp
```

OpenCode 配置示例：

```json
{
  "mcp": {
    "design-to-code": {
      "type": "local",
      "command": ["node", "/absolute/path/to/image2html/dist/mcp/index.js"],
      "enabled": true,
      "env": {
        "QWEN_VL_BASE_URL": "http://vision-model.internal/v1",
        "QWEN_VL_API_KEY": "replace-me",
        "VISION_MODEL": "qwen-vl-plus",
        "GLM_BASE_URL": "http://code-model.internal/v1",
        "GLM_API_KEY": "replace-me",
        "CODE_MODEL": "qwen-flash"
      }
    }
  }
}
```

提供的 MCP 工具：

| 工具 | 用途 |
| --- | --- |
| `generate_component` | 根据设计稿生成组件代码 |
| `validate_design` | 渲染代码并与原图进行视觉对比 |
| `repair_component` | 根据差异区域修复代码 |
| `analyze_structure` | 输出设计稿的结构化 JSON |

### Node.js API

```ts
import { DesignToCode } from 'image2html';

const converter = new DesignToCode();
const result = await converter.convert({
  image: { source: 'examples/fixtures/login-design.png', type: 'path' },
  options: {
    framework: 'html',
    styleFramework: 'inline',
    componentLibrary: 'none',
    typescript: false,
    responsive: true,
    accessibility: true,
  },
  modelConfig: {
    visionModel: {
      baseUrl: process.env.QWEN_VL_BASE_URL!,
      model: process.env.VISION_MODEL!,
      apiKey: process.env.QWEN_VL_API_KEY!,
    },
    codeModel: {
      baseUrl: process.env.GLM_BASE_URL!,
      model: process.env.CODE_MODEL!,
      apiKey: process.env.GLM_API_KEY!,
    },
  },
});

console.log(result.code.code);
await converter.close();
```

## 验证

```bash
# 完整模型生成与视觉校验
pnpm verify -- examples/fixtures/login-design.png output

# 通过真实 MCP 客户端调用视觉校验
pnpm verify:mcp
```

验证脚本位于 `scripts/`；测试设计稿位于 `examples/fixtures/`。

## 项目结构

```text
image2html/
├── src/                 # 生产代码
│   ├── codegen/         # Token 与组件映射
│   ├── llm/             # OpenAI 兼容模型客户端
│   ├── mcp/             # MCP Server
│   ├── prompts/         # 结构分析与代码生成提示词
│   ├── validator/       # 浏览器渲染与视觉校验
│   ├── cli.ts           # CLI 入口
│   └── index.ts         # 公共 API
├── test/                # Vitest 单元与回归测试
├── scripts/             # 端到端和 MCP 验证脚本
├── examples/            # 示例及测试设计稿
├── docs/                # 方案与实施文档
├── dist/                # 构建产物（不入库）
├── output/              # 生成结果（不入库）
├── LICENSE              # MIT 开源协议
├── package.json         # 包、CLI 与 MCP 元数据
└── tsconfig.json        # TypeScript 构建配置
```

## 文档

- [完整技术方案](docs/design-to-code-solution.md)
- [MCP 使用示例](examples/mcp-usage.md)
- [标准项目结构实施计划](docs/superpowers/plans/2026-11-10-standard-project-structure.md)

## License

[MIT](LICENSE) © 2026 image2html contributors
