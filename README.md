# image2html

将高保真 UI 设计稿转换为 HTML、React 或 Vue 代码，并通过浏览器截图和像素对比自动检查视觉还原度。支持作为 Node.js 库、CLI 和 MCP Server 使用，可接入 OpenCode、Cursor 等 AI 开发工具。

## 功能

- 使用视觉模型识别页面区域、组件、排版和 Design Token
- 使用通用语言模型生成 HTML、React 或 Vue 代码
- 将硬编码样式映射为 CSS 变量，并映射常用组件库
- 使用 Playwright 和 Pixelmatch 输出相似度、差异区域及对比图
- 通过 MCP 提供生成、校验、修复和结构分析工具

## 生成与质量模式

默认使用 `direct` 快速路径：Qwen VL 直接从图片流式生成代码，不再先生成庞大的结构 JSON。需要审计页面结构时，可设置 `pipeline: "structured"` 使用专家路径。

质量模式：

- `fast`：生成和校验，不自动修复；
- `balanced`：校验失败时进行有界自动修复，并保留最高相似度版本；
- `precision`：允许更多修复轮次，仍受 `MAX_RETRY_COUNT` 限制。

转换结果包含 `analysisMs`、`generationMs`、`validationMs`、`repairMs`、`totalMs`、`modelCalls` 和 `repairIterations`，便于持续评估速度与质量。

视觉校验同时返回整图、内容区域和边缘指标，并分别应用 `VISUAL_SIMILARITY_THRESHOLD`、`MIN_CONTENT_SIMILARITY`、`MIN_EDGE_SIMILARITY` 门禁，避免大面积空白导致虚假高分。主校验按原图尺寸渲染，区域差异通过一次差异掩码聚合生成。

## 框架与工程支持

| 目标框架 | 组件库 | 样式方案 | 构建与视觉校验 |
| --- | --- | --- | --- |
| HTML | `none` | `tailwind`、`scss`、`css-modules`、`inline` | 浏览器直接渲染 |
| React 18 | `antd`、`none` | `tailwind`、`inline` | TypeScript 检查、Vite 构建、Playwright 截图 |
| Vue 3 | `element`、`none` | `tailwind`、`inline` | `vue-tsc` 检查、Vite 构建、Playwright 截图 |

非法组合会在模型调用前报错，例如 React + Element Plus、Vue + Ant Design，或 React/Vue + SCSS/CSS Modules。React TypeScript 输出 `.tsx`，JavaScript 输出 `.jsx`；Vue 输出合法 SFC。React/Vue 不再直接交给 `page.setContent()`，而是在临时 Vite 工程中完成真实构建和页面挂载后再进行视觉比较。

使用 `--project` 可导出完整 Vite 工程，包含 `package.json`、入口文件、Vite/TypeScript 配置和对应样式配置：

```bash
node dist/cli.js convert examples/fixtures/login-design.png \
  --framework react --style tailwind --component-library antd \
  --project --output output/react-project

node dist/cli.js convert examples/fixtures/login-design.png \
  --framework vue --style inline --component-library element \
  --project --output output/vue-project
```

进入导出目录后可运行 `pnpm install`、`pnpm build` 和 `pnpm dev`。Node.js API 同时导出 `createFrameworkProjectFiles()` 与 `exportFrameworkProject()`，复用同一套工程模板。分段生成仍仅限 HTML。

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
| `extract_assets` | 识别并裁剪可复用的 Logo、图标和图片 |

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

### 多用户 HTTP 服务

在 `.env` 中为用户配置独立密钥：

```env
API_KEYS=alice:long-random-secret,bob:another-long-random-secret
JOB_CONCURRENCY=2
DATA_DIR=data
```

启动：

```bash
pnpm build
pnpm serve
```

或使用 Docker：

```bash
docker compose up -d --build
```

服务提供异步任务、图片上传、用户隔离、并发限制、限流、健康检查和产物下载。通过 `/v1/jobs/:id/events` 提供 SSE 进度，通过 `/v1/jobs/:id/preview` 提供生成中的代码预览。相同图片内容、生成选项、模型与校验配置会复用成功的转换结果；缓存命中的任务仍拥有独立产物，指标标记 `cacheHit: true`。详细接口及运维说明见[部署指南](docs/deployment.md)。

## 验证

三框架真实图片回测：

```bash
pnpm verify:frameworks -- examples/fixtures/demo/login.png output/framework-verification
# 也可只回测指定框架：在末尾追加 react 或 vue，多个目标用逗号分隔
```

2026-11-13 使用“电鸭”设计稿回测，三种框架均完成真实构建、渲染和产物导出，React/Vue 导出工程也分别通过独立 `pnpm build`：

| 框架 | 整图相似度 | 质量门禁 |
| --- | ---: | --- |
| HTML | 92.36% | 未通过 |
| React | 93.50% | 未通过 |
| Vue | 93.44% | 未通过 |

构建可运行与视觉质量通过是两个独立结论；当前内容/边缘门禁仍需继续优化，不能把成功生成工程报告为高保真通过。

```bash
# 完整模型生成与视觉校验
pnpm verify -- examples/fixtures/login-design.png output

# 通过真实 MCP 客户端调用视觉校验
pnpm verify:mcp

# 启动 HTTP 服务并验证真实任务和产物下载
pnpm verify:server
```

验证脚本位于 `scripts/`；测试设计稿位于 `examples/fixtures/`。

## 项目结构

```text
image2html/
├── src/                 # 生产代码
│   ├── codegen/         # Token 与组件映射
│   ├── llm/             # OpenAI 兼容模型客户端
│   ├── runtime/           # 技术栈校验、Vite 工程模板与运行时
│   ├── mcp/             # MCP Server
│   ├── prompts/         # 结构分析与代码生成提示词
│   ├── validator/       # 浏览器渲染与视觉校验
│   ├── cli.ts           # CLI 入口
│   └── index.ts         # 公共 API
├── test/                # Vitest 单元与回归测试
├── scripts/             # 端到端和 MCP 验证脚本
├── examples/            # 示例及测试设计稿
├── docs/                # 方案与实施文档
├── Dockerfile           # 含 Chromium 的生产镜像
├── docker-compose.yml   # 单实例多用户部署
├── dist/                # 构建产物（不入库）
├── output/              # 生成结果（不入库）
├── LICENSE              # MIT 开源协议
├── package.json         # 包、CLI 与 MCP 元数据
└── tsconfig.json        # TypeScript 构建配置
```

## 文档

- [完整技术方案](docs/design-to-code-solution.md)
- [MCP 使用示例](examples/mcp-usage.md)
- [screenshot-to-code 提速研究](docs/research/screenshot-to-code-optimization.md)
- [高保真与自动校正方案](docs/research/quality-auto-correction.md)
- [标准项目结构实施计划](docs/superpowers/plans/2026-11-10-standard-project-structure.md)

## License

[MIT](LICENSE) © 2026 image2html contributors
