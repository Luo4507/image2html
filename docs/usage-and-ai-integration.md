# 使用及配置指导：CLI、OpenCode、Codex 与其他 AI 工具

本文面向需要在本地使用 image2html，或把它接入 AI 开发工具的用户。示例中的模型地址、模型名和密钥均为占位值，请替换为自己的配置。

> 接入前请先完成安装和构建。本文给出的是与源码及官方配置文档一致的配置示例，不代表已在所有 AI 客户端版本中逐一实测。

## 1. 选择使用方式

| 使用方式 | 适用场景 | 主要产物 |
| --- | --- | --- |
| CLI | 命令行转换、脚本批处理、导出可运行工程 | 单个源码文件，或 `--project` 导出的完整 Vite 工程 |
| 原生远程 MCP | OpenCode 通过 `/mcp` URL 调用集中服务，不启动本地 MCP 进程 | 远程生成源码、精简校验结果；目前仅生成工具 |
| 本地 MCP | OpenCode、Codex、Cursor 等 AI 工具调用生成、校验和修复能力 | 原文本及 `structuredContent` 结构化结果 |
| stdio 远程适配器 | 需要兼容旧客户端的集中生成方式 | 远程生成源码、精简校验结果；目前仅生成工具 |
| Node.js API | 在自己的 Node.js 程序中集成 | 结构化转换结果 |
| HTTP 服务 | 多用户、任务队列、权限隔离和产物下载 | `/mcp` 原生远程 MCP、`/v1/jobs` 异步任务及可下载产物 |

OpenCode 远程接入推荐使用 **`http(s)://<服务地址>/mcp`**，传输方式为 Streamable HTTP，服务端复用 API 密钥、任务队列与用户隔离。本地五工具仍由 AI 客户端启动 `node .../dist/mcp/index.js`；兼容适配器使用 `node .../dist/mcp/remote-index.js` 连接集中 HTTP 服务。只有 `/mcp` 是原生远程 MCP 地址，不要把服务根 URL 或 `/v1/jobs` 填进远程 MCP 的 `url`。

`generate_component` **不会自动在业务项目中创建文件，也不会导出完整 Vite 工程**。需要落盘时，让 AI 客户端把返回源码写入指定文件；需要完整工程时，使用 CLI `--project`。

## 2. 安装与初始化

### 2.1 环境要求

- Node.js 20 或更高版本。
- pnpm 10 或更高版本。
- 两个兼容 OpenAI Chat Completions API 的模型服务：视觉模型负责识图，代码模型负责结构分析、修复等任务。
- 用于视觉校验的 Playwright Chromium，或本机 Chrome。

以下命令默认在 image2html 项目根目录执行：

```bash
git clone https://github.com/Luo4507/image2html.git
cd image2html
pnpm install
cp .env.example .env
```

Windows PowerShell 可使用：

```powershell
Copy-Item .env.example .env
```

安装 Chromium：

```bash
pnpm exec playwright install chromium
```

如果已经安装 Chrome，可以不下载 Chromium，在 `.env` 中指定浏览器路径，例如：

```env
PLAYWRIGHT_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

### 2.2 模型配置

编辑项目根目录的 `.env`：

```env
LLM_VL_BASE_URL=http://vision-model.internal/v1
LLM_VL_API_KEY=replace-with-your-vision-key
LLM_VL_MODEL=your-vision-model-name

LLM_BASE_URL=http://code-model.internal/v1
LLM_API_KEY=replace-with-your-code-key
LLM_MODEL=your-code-model-name

VISUAL_SIMILARITY_THRESHOLD=85.0
MIN_CONTENT_SIMILARITY=60.0
MIN_EDGE_SIMILARITY=40.0
CHECK_TEXT_COVERAGE=true
MIN_TEXT_COVERAGE=80.0
MAX_RETRY_COUNT=4

DEFAULT_FRAMEWORK=react
DEFAULT_STYLE_FRAMEWORK=tailwind
DEFAULT_COMPONENT_LIBRARY=antd
DEFAULT_PIPELINE=direct
QUALITY_MODE=precision
```

`DEFAULT_*` 和 `QUALITY_MODE` 用于 HTTP 服务以及 Node.js 的 `designToCode()` 快捷函数。CLI 和本地 MCP 使用各自参数的默认值；如需改变它们的框架、质量或布局行为，请显式传入对应参数，不要只修改这些环境变量。

| 变量 | 作用 |
| --- | --- |
| `LLM_VL_BASE_URL` | 视觉模型的 OpenAI 兼容 API 根地址，通常包含 `/v1` |
| `LLM_VL_API_KEY` | 视觉模型密钥 |
| `LLM_VL_MODEL` | 视觉模型在服务端注册的实际模型名 |
| `LLM_BASE_URL` | 通用语言模型的 OpenAI 兼容 API 根地址 |
| `LLM_API_KEY` | 通用语言模型密钥 |
| `LLM_MODEL` | 通用语言模型在服务端注册的实际模型名 |
| `LLM_VL_ENABLE_THINKING` | 可选：显式开关视觉模型思考；不设置则保持服务端默认 |
| `LLM_ENABLE_THINKING` | 可选：显式开关通用模型思考；不设置则保持服务端默认 |

变量名不绑定具体模型供应商，但必须确认所用模型具备相应能力。旧变量 `QWEN_VL_*`、`VISION_MODEL`、`GLM_*`、`CODE_MODEL` 仍作为兼容回退；新部署建议仅使用上表中的通用命名，新旧同时设置时优先使用 `LLM` 和 `LLM_VL` 变量。不要将 `.env` 或真实密钥提交到 Git，也不要把真实密钥粘贴到公开 Issue、聊天记录或示例配置中。

**不要直接沿用源码中的默认内网地址和模型名**。如果模型请求发往 `.internal` 地址，通常说明 `.env` 未被读取或变量名配置错误。

### 2.3 构建及本地自检

```bash
pnpm typecheck
pnpm build
node dist/cli.js --help
pnpm verify:mcp
```

`pnpm verify:mcp` 会启动真实 stdio MCP 客户端，列出工具并调用 `validate_design`。它会实际渲染页面并比较示例图片，可用于排除 MCP 启动和浏览器问题；它不是 OpenCode 或 Codex 客户端本身的连接测试。

## 3. CLI 使用

### 3.1 转换单个设计稿

HTML 示例：

```bash
node dist/cli.js convert examples/login.png --framework html --style inline --component-library none --output output/html
```

React + TypeScript + Ant Design 示例：

```bash
node dist/cli.js convert examples/login.png --framework react --style tailwind --component-library antd --quality balanced --output output/react
```

Vue 示例：

```bash
node dist/cli.js convert examples/login.png --framework vue --style inline --component-library element --output output/vue
```

常用选项：

| 选项 | 可选值或含义 | 默认值 |
| --- | --- | --- |
| `--framework` | `react`、`vue`、`html` | `react` |
| `--style` | `tailwind`、`scss`、`css-modules`、`inline` | `tailwind` |
| `--component-library` | `antd`、`element`、`none` | React 为 `antd`，Vue 为 `element`，HTML 为 `none` |
| `--no-typescript` | 不使用 TypeScript | 默认使用 TypeScript |
| `--no-validate` | 跳过视觉校验；不等于校验通过 | 默认校验 |
| `--pipeline` | `direct` 直接生成，`structured` 先生成结构 JSON | `direct` |
| `--quality` | `fast`、`balanced`、`precision` | `precision` |
| `--layout` | `single`、`segmented`、`auto`；`auto` 只对大长图分段 | `single` |
| `--cache` | 复用本地成功结果；失败和视觉未通过不缓存 | 默认关闭 |
| `--extract-assets` | 先提取图片资源并在生成代码中引用 | 默认不提取 |
| `--project` | 导出完整 Vite 工程 | 默认只写源码文件 |
| `--output` | 输出目录 | `./generated` |

React/Vue 目前只支持 `tailwind` 和 `inline`；`scss`、`css-modules` 仅适用于 HTML。使用 `--no-validate` 时，成功的未校验结果也可以写入缓存；缓存命中不代表通过视觉质量门禁。

### 3.2 导出完整可运行工程

```bash
node dist/cli.js convert examples/login.png --framework react --style tailwind --component-library antd --project --output output/react-project
```

然后进入导出目录：

```bash
cd output/react-project
pnpm install
pnpm build
pnpm dev
```

需要自动裁剪 Logo、图标和图片时，在 `convert` 命令中追加 `--extract-assets`。完整工程会把提取资源放入 `public/assets`。

### 3.3 批量转换

```bash
node dist/cli.js batch examples/fixtures --framework html --style inline --component-library none --output output/batch
```

需要并行时追加 `--concurrency 2`，需要复用相同转换时追加 `--cache`：

```bash
node dist/cli.js batch examples/fixtures --framework html --style inline --component-library none --concurrency 2 --cache --output output/batch
```

`batch` 处理输入目录顶层的 PNG、JPG、JPEG 文件，不递归扫描子目录。汇总写入 `<输出目录>/conversion-report.json`。输出源码带图片名前缀，避免同名文件覆盖。批量命令支持 `--extract-assets`，但没有 `--project`。并行越高不一定越快，遇到模型限流时调低并发。

## 4. MCP 配置的通用原则

无论使用哪种 AI 客户端，都建议采用下面的启动参数：

- 可执行文件：`node`。
- 参数：image2html 的 `dist/mcp/index.js` **绝对路径**。
- 工作目录 `cwd`：image2html 项目根目录。
- 配置来源：优先让服务从上述工作目录读取 `.env`。

`cwd` 很重要：项目通过 `dotenv` 从进程的当前工作目录加载 `.env`。如果只写入口绝对路径，却让 MCP 进程在另一个业务项目中启动，它可能读不到 image2html 的 `.env`。

假设安装目录如下，后文示例均按此替换：

| 系统 | image2html 安装目录 | MCP 入口 |
| --- | --- | --- |
| Windows | `F:\code\image2html` | `F:\code\image2html\dist\mcp\index.js` |
| macOS / Linux | `/absolute/path/to/image2html` | `/absolute/path/to/image2html/dist/mcp/index.js` |

图片路径应使用**运行 MCP 服务的机器**可访问的绝对路径，而不是只能被聊天界面识别的临时附件路径。例如 Windows 使用 `F:\designs\dashboard.png`，macOS/Linux 使用 `/home/user/designs/dashboard.png`。AI 客户端、MCP 和图片不在同一机器或容器时，还要先解决文件共享或挂载问题。

## 5. 接入 OpenCode

OpenCode 可读取项目根目录的 `opencode.json(c)` 或 `.opencode/opencode.json(c)`，全局配置位于 `~/.config/opencode/opencode.json(c)`。Windows 用户目录形式通常为 `%USERPROFILE%\.config\opencode\opencode.jsonc`。

修改配置时，请合并已有的 `mcp` 配置，不要覆盖其他模型或 MCP 服务。

### 5.1 OpenCode V2：原生远程 MCP（推荐）

远程方式不需要 OpenCode 机器安装项目、Node.js、模型密钥或 Chromium。

OpenCode V2 桌面版由后台服务连接 MCP，直接将个人密钥配置给后台服务：

```powershell
opencode service set env IMAGE2HTML_API_KEY "replace-with-your-personal-key"
opencode service restart
```

独立 CLI 也可以从用户环境变量读取密钥：

```powershell
[Environment]::SetEnvironmentVariable("IMAGE2HTML_API_KEY", "replace-with-your-personal-key", "User")
```

设置后重新打开终端和 OpenCode。不要把真实密钥写入 JSON 或提交到 Git。随后将下面配置合并到项目或全局 `opencode.jsonc`：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "image2html": {
        "type": "remote",
        "url": "http://localhost:3000/mcp",
        "oauth": false,
        "headers": {
          "Authorization": "Bearer {env:IMAGE2HTML_API_KEY}"
        },
        "codemode": false,
        "timeout": {
          "execution": 600000
        }
      }
    }
  }
}
```

公司部署时将 `url` 换成 `https://<公司服务域名>/mcp`。`type: "remote"` 使用 Streamable HTTP；`oauth: false` 表示只用 API 密钥，不启动 OAuth 登录。远程工具目前只有 `generate_component`，图片使用 `image_base64` 上传，避免服务端无法访问 OpenCode 本机路径。

检查连接：

```bash
opencode mcp list
```

也可在 OpenCode 中使用 `/mcps`。看到 `image2html connected` 即表示远程连接成功。

### 5.2 OpenCode V2：本地 stdio MCP

V2 将服务名放在 `mcp.servers` 下，并使用 `environment` 传递额外环境变量；不需要 `enabled: true`，默认就会连接。

macOS / Linux 示例：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "design-to-code": {
        "type": "local",
        "command": ["node", "/absolute/path/to/image2html/dist/mcp/index.js"],
        "cwd": "/absolute/path/to/image2html",
        "codemode": false
      }
    }
  }
}
```

Windows 示例：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "design-to-code": {
        "type": "local",
        "command": ["node", "F:\\code\\image2html\\dist\\mcp\\index.js"],
        "cwd": "F:\\code\\image2html",
        "codemode": false
      }
    }
  }
}
```

`codemode: false` 让五个工具直接出现在客户端的原生工具列表中，便于按名称检查；删除该项则使用 OpenCode 当前的 Code Mode 默认行为。

检查连接：

```bash
opencode mcp list
```

也可在 OpenCode 中使用 `/mcps` 查看服务。如果刚刚修改配置但状态没有变化，重启 OpenCode 后重新检查。

### 5.3 已验证的 OpenCode 示例

项目曾在 OpenCode `1.19.6` 上使用 V1 的 `mcp.image2html` 配置完成实际验证：MCP 连接成功，`validate_design` 对项目示例返回相似度 100%，`generate_component` 真实调用模型并返回完整 HTML。该次生成结果的整图相似度为 98.96%，但最终 `passed=false`，说明仍有其他质量门禁未满足，不属于连接或生成失败。

这只是指定版本和示例的历史实测记录，不代表其他版本、图片或五个工具均已逐一验证。其他版本应按其实际配置层级选择上述 V1 或 V2 示例。

### 5.4 OpenCode V1：旧版配置格式

V1 不使用 `mcp.servers` 这一层，并将服务名直接放在 `mcp` 下：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "design-to-code": {
      "type": "local",
      "command": ["node", "/absolute/path/to/image2html/dist/mcp/index.js"],
      "cwd": "/absolute/path/to/image2html",
      "enabled": true,
      "environment": {}
    }
  }
}
```

Windows 下同样将入口和 `cwd` 改为双反斜线路径。V1、V2 的配置层级不同，不要混用。

### 5.5 不使用 `.env` 时传递模型配置

推荐仍使用安装目录中的 `.env`。确需在 OpenCode 中显式传参时，将下面内容加入对应服务的 `environment` 对象，而不是使用名为 `env` 的字段：

```json
{
  "LLM_VL_BASE_URL": "{env:LLM_VL_BASE_URL}",
  "LLM_VL_API_KEY": "{env:LLM_VL_API_KEY}",
  "LLM_VL_MODEL": "{env:LLM_VL_MODEL}",
  "LLM_BASE_URL": "{env:LLM_BASE_URL}",
  "LLM_API_KEY": "{env:LLM_API_KEY}",
  "LLM_MODEL": "{env:LLM_MODEL}"
}
```

这些值引用启动 OpenCode 的环境变量。变量未设置时会被替换为空字符串，因此应先在本机配置环境变量，再启动 OpenCode。桌面客户端未必继承终端临时设置的变量。

## 6. 接入 Codex

Codex CLI、IDE 扩展及同一 Codex 主机的 ChatGPT 桌面客户端共享 MCP 配置。用户级配置为 `~/.codex/config.toml`，Windows 通常为 `%USERPROFILE%\.codex\config.toml`。受信任的项目也可以使用项目根目录 `.codex/config.toml`。

### 6.1 推荐：直接编辑 config.toml

macOS / Linux 示例：

```toml
[mcp_servers.design-to-code]
command = "node"
args = ["/absolute/path/to/image2html/dist/mcp/index.js"]
cwd = "/absolute/path/to/image2html"
startup_timeout_sec = 30
tool_timeout_sec = 600
```

Windows 示例使用 TOML 字面字符串（单引号），路径中的反斜杠无需转义：

```toml
[mcp_servers.design-to-code]
command = "node"
args = ['F:\code\image2html\dist\mcp\index.js']
cwd = 'F:\code\image2html'
startup_timeout_sec = 30
tool_timeout_sec = 600
```

`tool_timeout_sec = 600` 将单次工具超时调整为 10 分钟，减少模型生成和浏览器校验被默认 60 秒超时中断的概率；它不会让失败的模型请求自动成功，可按实际耗时调整。

检查配置：

```bash
codex mcp list
```

在 Codex TUI 中可用 `/mcp` 查看活动服务。修改配置后重新启动 Codex 会话；若客户端仍使用旧配置，完全重启客户端后再检查。

### 6.2 使用 Codex CLI 添加

macOS / Linux：

```bash
codex mcp add design-to-code -- node /absolute/path/to/image2html/dist/mcp/index.js
```

Windows PowerShell：

```powershell
codex mcp add design-to-code -- node F:\code\image2html\dist\mcp\index.js
```

此方式未指定 `cwd`，因此需要随后编辑 `config.toml` 补上安装目录的 `cwd`，否则 `.env` 可能无法加载。也可通过重复 `--env KEY=VALUE` 显式传参，但这会把值写入配置，不建议用于真实密钥。

### 6.3 从环境变量继承配置

如果不想让 Codex 从 `.env` 读取，可以在启动 Codex 前设置模型变量，并在服务配置中加入白名单：

```toml
env_vars = [
  "LLM_VL_BASE_URL",
  "LLM_VL_API_KEY",
  "LLM_VL_MODEL",
  "LLM_BASE_URL",
  "LLM_API_KEY",
  "LLM_MODEL"
]
```

将这段数组放入 `[mcp_servers.design-to-code]` 表内，且放在任何子表之前。`env_vars` 表示从 Codex 本地进程环境允许并转发变量，不会自动读取 image2html 的 `.env`。图形界面启动的客户端可能不会继承终端环境，遇到空配置时优先改用 `cwd + .env` 方式。

## 7. 接入其他支持 stdio MCP 的工具

不同客户端字段名略有差异，但本地服务通常都需要以下三项：

```json
{
  "mcpServers": {
    "design-to-code": {
      "command": "node",
      "args": ["/absolute/path/to/image2html/dist/mcp/index.js"]
    }
  }
}
```

这是 Cursor 风格的 `mcpServers` 示例，不是 Codex 或 OpenCode V2 的配置格式。通用字段无法替代具体客户端文档：如果客户端支持工作目录，请设置为 image2html 安装目录；否则可在该目录启动客户端，或按客户端规范显式传递六个模型环境变量。

本地 stdio 接入遵循同样原则：使用 Node 入口绝对路径、正确的安装目录和模型配置，不要把 HTTP 地址填进 `command`。支持原生远程 MCP 的客户端则应使用 `type: "remote"` 和 `http(s)://<服务地址>/mcp`。

## 8. 五个 MCP 工具与结构化结果

客户端中的服务配置名是 `design-to-code`，对应本地服务内部名称也为 `design-to-code`。

| 工具 | 必填参数 | 常用可选参数 | `structuredContent` 主要字段 |
| --- | --- | --- | --- |
| `generate_component` | `image_path` | `framework`、`style_framework`、`component_library`、`typescript`、`responsive`、`pipeline`、`quality_mode`、`layout_mode`、`asset_mode` | `success`、`code`、`filename`、`imports`、`components`、`validation`、`metrics` |
| `validate_design` | `original_image`、`code` | `threshold`、`framework`、`style_framework`、`component_library`、`typescript` | `success`、`passed`、`similarity`、`quality`、`regions`、`suggestions` |
| `repair_component` | `original_image`、`code` | `diff_regions`、目标代码选项、`quality_mode`、`max_iterations`、`threshold` | `success`、`code`、最终 `validation`、`repairIterations`、`qualityHistory`、`metrics` |
| `analyze_structure` | `image_path` | 无 | `success`、`structure` 对象 |
| `extract_assets` | `image_path` | `output_dir` | `success`、`outputDir`、`paths` |

所有工具仍保留原来的 `content` 文本，同时提供 `structuredContent` 和工具 `outputSchema`。校验截图与差异图的 base64 不会放入结构化结果，避免显著放大 AI 上下文。

`generate_component` 的主要选项：

- `framework`：`react`、`vue`、`html`。
- `style_framework`：`tailwind`、`scss`、`css-modules`、`inline`。
- `component_library`：`antd`、`element`、`none`。省略时根据框架选择默认值。
- `pipeline`：`direct` 或 `structured`。
- `quality_mode`：`fast`、`balanced`、`precision`。
- `layout_mode`：`single`、`segmented` 或 `auto`；`auto` 只对大长图分段，普通页面仍走单页生成。
- `asset_mode`：`none` 或 `extract`。

常用合法组合为 React + Ant Design、Vue + Element Plus、HTML + `none`。React/Vue 的样式方案使用 `tailwind` 或 `inline`；HTML 可使用四种样式方案。

`repair_component` 会先校验当前代码，再执行视觉修复、候选重新校验和质量择优。质量没有提高的候选不会被采用。`quality_mode=fast|balanced|precision` 分别对应 0、2、4 轮预算，`max_iterations` 可进一步指定上限，但最终仍受 `MAX_RETRY_COUNT` 限制。目标代码选项必须与源码一致，否则 React/Vue 可能被误按 HTML 校验。

旧调用的 `diff_regions` 仍可传入，但现在是可选兼容参数；也可以直接将 `validate_design` 的 `structuredContent.regions` 传入。新流程以实时校验结果为准。

`extract_assets` 会真实写文件。建议提供明确的绝对 `output_dir`；省略时使用图片同级的 `<图片名>-assets` 目录。

### 8.1 工具错误与视觉未通过的区别

文件不存在、模型生成失败或执行异常时，工具返回 `isError: true`，并附带稳定错误码：

```json
{
  "success": false,
  "error": {
    "code": "FILE_NOT_FOUND",
    "message": "文件不存在: ..."
  }
}
```

常见错误码有 `FILE_NOT_FOUND`、`GENERATION_FAILED`、`REPAIR_FAILED`、`TOOL_EXECUTION_FAILED`。视觉校验未通过则是正常业务结果：`success: true`、`passed: false`，不设置 `isError`。AI 调用方不能用“工具已返回”代替质量验收。

### 8.2 公司内网多人使用：原生远程 MCP

公司服务器按[部署指南](deployment.md)运行单实例服务，OpenCode 直接连接 `/mcp`，不再需要在每位同学机器上运行适配器：

```text
OpenCode → Streamable HTTP + 个人 Bearer API 密钥 → 公司 /mcp → 任务队列 → 内网模型与 Chromium
```

配置见 5.1。原生端点只注册 `generate_component`，复用鉴权、限流、任务队列和按用户隔离的产物。OpenCode 本机图片通过 `image_base64` 上传；只有服务端可见的图片才使用 `image_path`。`asset_mode=extract` 不受支持，独立校验、修复、结构分析和资源提取仍由本地五工具入口提供。

### 8.3 兼容旧客户端：stdio 远程适配器

需要 stdio 的客户端仍可使用 `dist/mcp/remote-index.js`。用户机器设置：

```env
IMAGE2HTML_URL=https://image2html.internal.example
IMAGE2HTML_API_KEY=replace-with-personal-key
IMAGE2HTML_POLL_INTERVAL_MS=1000
IMAGE2HTML_TIMEOUT_MS=600000
```

Codex 使用：

```toml
[mcp_servers.design-to-code]
command = "node"
args = ["/absolute/path/to/image2html/dist/mcp/remote-index.js"]
cwd = "/absolute/path/to/image2html"
env_vars = ["IMAGE2HTML_URL", "IMAGE2HTML_API_KEY"]
startup_timeout_sec = 30
tool_timeout_sec = 600
```

适配器同样只注册 `generate_component`，支持本机 `image_path` 或 `image_base64`，执行任务上传、轮询和源码下载。它不是原生 Streamable HTTP 端点，`IMAGE2HTML_URL` 只能由适配器读取，不能直接填到远程 MCP 的 `url` 字段。个人密钥只通过环境变量传递，不要提交到 Git 或写入日志。

## 9. 可直接使用的 AI 提示词

### 9.1 按项目规范生成网页

OpenCode 远程接入时，把图片拖进对话，或直接使用项目中的图片路径：

```text
根据 designs/dashboard.png 生成网页并接入当前项目。
遵循项目现有的技术栈、目录结构和代码规范，使用 image2html 完成转换。
完成后检查页面效果并运行构建，有问题继续调整。
```

不需要手写 Base64 或逐项填写工具参数。OpenCode 会处理本机图片上传，并根据项目上下文生成代码；远程服务名使用 `image2html`。

本地五工具入口使用服务名 `design-to-code`，图片路径应改为 MCP 所在机器可读取的绝对路径。需要指定技术栈时，只需补一句“使用 Vue + Element Plus”或“使用 React + Ant Design”，具体参数见第 8 节。

### 9.2 校验当前文件

```text
使用 design-to-code 校验 src/components/Dashboard.tsx 是否还原 F:\designs\dashboard.png。
按照文件的实际技术栈检查，报告视觉校验是否通过和主要差异，先不要修改代码。
```

### 9.3 修复后重新校验

```text
使用 design-to-code 修复 src/components/Dashboard.tsx 与 F:\designs\dashboard.png 之间的视觉差异。
将修复后的代码写回文件，重新检查页面效果，最后运行项目构建。
```

独立校验和修复提示词用于本地五工具入口，图片需使用绝对路径。远程 `generate_component` 已在一次生成中完成视觉校验和有界修复，不需要再调用独立修复工具。

### 9.4 只分析设计稿

```text
使用 design-to-code 分析 F:\designs\dashboard.png。
总结页面结构、主要组件和设计风格，不要生成或修改业务代码。
```

## 10. 理解质量和产物

### 10.1 质量模式

- `fast`：生成和校验，不自动修复。
- `balanced`：校验失败时进行有界自动修复，并保留质量分数更高的版本。
- `precision`：允许更多修复轮次，仍受 `MAX_RETRY_COUNT` 限制。

默认使用 `precision`，`MAX_RETRY_COUNT=4`，并开启文字完整性检查。`direct` 是默认生成路径；`structured` 会先产生结构化页面表示，适合需要结构审计的场景，但通常增加模型调用。

需要复用相同图片的成功结果时，CLI 使用 `--cache`；本地 MCP 在环境变量中设置 `CONVERSION_CACHE=true`。默认缓存目录是 `.cache/image2html-conversions`，可用 `CONVERSION_CACHE_DIR` 修改。缓存键包含图片内容、模型和参数；执行失败或视觉未通过不会缓存，但主动跳过校验的成功结果可以缓存。缓存命中不代表通过视觉质量门禁。清理该目录即可清空本地缓存。

结果中的 `metrics.modelRequests` 记录各次模型请求的首响应、首内容、总耗时、字符数和可用的 token 统计；`validation.timings` 记录主渲染、图片比较和额外视口耗时。`repairMs` 包含候选重新校验，因此与累计的 `validationMs` 有重叠，不能把各阶段数字直接相加当作总耗时。

对于兼容 `enable_thinking` 的模型服务，可用 `LLM_VL_ENABLE_THINKING=false` 和 `LLM_ENABLE_THINKING=false` 显式关闭思考，以减少隐藏推理 token 和等待时间。默认不发送该字段，保持模型服务端原有行为；关闭思考可能降低生成或修复质量，应先对相同样本做质量与耗时对比，再决定是否用于生产。其他模型服务可能忽略或拒绝该字段，此时请保持变量未设置。

### 10.2 质量门禁

| 环境变量 | 默认值 | 含义 |
| --- | ---: | --- |
| `VISUAL_SIMILARITY_THRESHOLD` | `85.0` | 整图相似度门槛 |
| `MIN_CONTENT_SIMILARITY` | `60.0` | 内容区域相似度门槛 |
| `MIN_EDGE_SIMILARITY` | `40.0` | 边缘相似度门槛 |
| `CHECK_TEXT_COVERAGE` | `true` | 生成流程默认检查文字完整性 |
| `MIN_TEXT_COVERAGE` | `80.0` | 文字覆盖率门槛 |

`validate_design` 的 `threshold` 参数只覆盖本次整图阈值，内容和边缘仍受默认校验配置约束。因此整图达到 85% 仍可能未通过，必须看最终 `passed` 结论。

### 10.3 产物边界

- MCP 生成和修复：返回原文本及 `structuredContent`，由 AI 客户端决定是否写入文件。
- MCP 资源提取：写入指定输出目录，并返回路径。
- CLI 普通转换：写入单个源码文件；有差异图时同时保存差异图。
- CLI `--project`：写入完整 Vite 工程。
- HTTP 服务：保存任务代码、结构、校验报告、截图及差异图，详见[部署指南](deployment.md)。

## 11. 常见问题

### AI 客户端看不到 MCP 工具

1. 先运行 `pnpm build`，确认 `dist/mcp/index.js` 存在。
2. 在 image2html 根目录运行 `pnpm verify:mcp`，区分服务问题和客户端配置问题。
3. OpenCode V2 检查 `mcp.servers`，V1 检查 `mcp`；Codex 检查 `[mcp_servers.design-to-code]`。
4. 执行对应的 `opencode mcp list` 或 `codex mcp list`，并在界面中检查连接状态。
5. 检查 OpenCode 的工具权限或 Codex 的工具允许/拒绝列表是否隐藏了工具。
6. 检查 `node` 是否位于 AI 客户端实际可使用的 `PATH`；图形界面找不到时改用 Node.js 可执行文件的绝对路径。
7. 修改配置后重启会话，必要时完全重启客户端。

### 报“文件不存在”

- 将设计稿路径改为 MCP 进程所在机器可访问的绝对路径。
- 检查文件名、扩展名、Windows 盘符及目录挂载。
- 不要把业务项目的相对路径误认为相对于 image2html 安装目录。
- AI 客户端在容器、SSH 或远程环境运行时，本机 `C:\...`、`F:\...` 路径通常不可直接使用。

### 模型返回 401、403、404 或连接失败

- `401/403`：检查密钥、权限和模型服务鉴权配置。
- `404`：检查 Base URL 是否应为 `/v1`，以及 `LLM_VL_MODEL`、`LLM_MODEL` 是否与服务端实际模型名完全一致。
- 连接失败或超时：检查内网、DNS、代理、防火墙和服务状态。
- 如果请求地址仍是 `.internal` 默认值，检查 MCP 的 `cwd` 是否指向 image2html 根目录，以及 `.env` 是否存在且变量名正确。
- 视觉和代码模型配置相互独立，应分别定位是哪个请求失败。

### Chromium 启动失败

```bash
pnpm exec playwright install chromium
```

或设置 `PLAYWRIGHT_EXECUTABLE_PATH` 指向现有 Chrome。确保该路径对 **MCP 子进程**有效。修改 `.env` 后重启 AI 客户端或 MCP 连接，使新环境变量生效。

### 已生成代码，但视觉门禁未通过

这不是 MCP 连接错误。先查看内容/边缘指标、差异区域和修复建议，再执行有界修复及重新校验。必要时改用 `precision`、检查设计稿是否过长、尝试 `layout_mode=segmented`，并进行人工验收。不要通过忽略内容/边缘指标来宣称高保真通过。

### 工具运行超时

模型生成、依赖处理和浏览器渲染可能超过 AI 客户端默认工具超时。Codex 可提高 `tool_timeout_sec`；OpenCode 可按其当前版本文档调整 `mcp.timeout` 或服务级 `timeout`。同时检查模型服务和 Chromium 日志，不要只无限增大超时。

### MCP 日志导致协议异常

stdio 的标准输出用于 MCP 消息。自定义启动脚本不要向 stdout 打印说明文字、进度条或密钥；诊断日志应写 stderr。不要为了方便调试把 `.env` 内容或请求密钥输出到日志。

## 12. 更新与重新配置

更新源码或依赖后，在 image2html 根目录执行：

```bash
pnpm install
pnpm build
pnpm verify:mcp
```

随后重启使用它的 AI 客户端会话。如果修改了 `.env`、Node 路径、MCP 入口或模型变量，也需要重启对应 MCP 连接。

## 13. Node.js API

作为依赖安装后，可以使用 `designToCode()` 快捷函数。它会读取模型与校验配置，并在结束后自动关闭浏览器资源：

```ts
import { designToCode } from 'image2html';

const result = await designToCode('F:/designs/dashboard.png', {
  framework: 'html',
  styleFramework: 'inline',
  componentLibrary: 'none',
  typescript: false,
  qualityMode: 'precision',
  layoutMode: 'single',
});

if (!result.success) throw new Error(result.error || '转换失败');
console.log(result.code.code);
console.log(result.validation?.passed);
```

直接在源码仓库中运行时，先执行 `pnpm build`，再从 `./dist/index.js` 导入。`.env` 仍从进程当前工作目录读取，图片路径应使用绝对路径。API 只返回结构化结果，不会自动把源码写入业务文件；需要落盘时由调用方自行写入。需要复用转换器、自定义模型配置或监听进度时，改用 `new DesignToCode()`，并在 `finally` 中调用 `close()`。

## 参考资料

- [OpenCode：MCP servers](https://docs.opencode.ai/docs/mcp-servers/)
- [OpenCode：Config](https://docs.opencode.ai/docs/config/)
- [OpenAI Codex：Model Context Protocol](https://developers.openai.com/codex/mcp)
- [OpenAI Codex：Config basics](https://developers.openai.com/codex/config-file/config-basic)
- 本项目的[部署指南](deployment.md)与[示例设计稿](../examples/README.md)
