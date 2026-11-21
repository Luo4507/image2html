# image2html 配置与使用指导手册

这份手册面向第一次使用 image2html 的用户。推荐先完成**本地 OpenCode 快速配置**，用项目自带示例跑通后，再接入自己的业务项目。

本文示例使用 Windows 安装目录 `F:\code\image2html`。如果你的目录不同，只需替换配置中的安装路径和图片路径。

> 已实测范围：OpenCode `1.19.6` 本地连接、`validate_design` 和真实 `generate_component`。Codex、远程适配器及其余工具提供与源码一致的配置方法，但不表示均已在对应客户端逐一实测。

## 1. 先选择使用方式

| 你的需求 | 推荐方式 | 是否需要本机模型和 Chromium |
| --- | --- | --- |
| 在自己的电脑上使用 OpenCode，需要生成、校验、修复、结构分析和资源提取 | 本地 MCP | 需要 |
| 公司统一部署，多人共享模型和浏览器 | 远程 MCP 适配器 | 不需要，服务器提供 |
| 只在终端转换图片，不使用 AI 客户端 | CLI | 需要 |
| 在自己的 Node.js 程序中调用 | Node.js API | 需要 |

**第一次使用请选本地 MCP。** 它的配置最直观，也方便定位问题。

## 2. 准备软件

需要：

1. Node.js 20 或更高版本。
2. pnpm 10。
3. OpenCode；Codex 用户见第 10 节。
4. 两个兼容 OpenAI Chat Completions API 的模型服务：
   - 视觉模型：读取设计稿，生成或修复代码。
   - 通用语言模型：结构 JSON 修复、代码生成或代码修复等任务。
5. Playwright Chromium，或本机已安装的 Chrome。

检查命令：

```powershell
node --version
pnpm --version
opencode --version
```

如果终端没有 `opencode`，可安装已实测的版本：

```powershell
npm install -g opencode-ai@1.19.6
```

这只是 OpenCode 客户端的安装命令，与 image2html 的模型配置是两件事。

## 3. 安装 image2html

### 3.1 获取代码并安装依赖

```powershell
git clone https://github.com/Luo4507/image2html.git
cd F:\code\image2html
pnpm install
```

如果已经克隆项目，只需进入实际安装目录并执行 `pnpm install`。

### 3.2 创建配置文件

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

macOS / Linux：

```bash
cp .env.example .env
```

编辑安装目录下的 `.env`，最少配置以下六项：

```env
LLM_VL_BASE_URL=http://vision-model.internal/v1
LLM_VL_API_KEY=replace-with-your-vision-key
LLM_VL_MODEL=your-vision-model-name

LLM_BASE_URL=http://code-model.internal/v1
LLM_API_KEY=replace-with-your-code-key
LLM_MODEL=your-code-model-name
```

| 变量 | 应填写什么 |
| --- | --- |
| `LLM_VL_BASE_URL` | 视觉模型的 OpenAI 兼容 API 地址，通常包含 `/v1` |
| `LLM_VL_API_KEY` | 视觉模型密钥 |
| `LLM_VL_MODEL` | 服务端实际注册的视觉模型名 |
| `LLM_BASE_URL` | 通用语言模型的 API 地址 |
| `LLM_API_KEY` | 通用语言模型密钥 |
| `LLM_MODEL` | 服务端实际注册的通用模型名 |

不要直接照抄示例中的 `.internal` 地址和模型名，必须替换为自己环境可用的值。`.env` 含真实密钥，不要提交到 Git。

### 3.3 安装浏览器并构建

```powershell
pnpm exec playwright install chromium
pnpm build
```

如果已经安装 Chrome，也可以在 `.env` 中指定：

```env
PLAYWRIGHT_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

路径必须对启动 MCP 的 OpenCode 子进程有效。

### 3.4 先验证服务本身

```powershell
node scripts/verify-mcp.mjs
```

成功时会列出五个工具，并显示类似：

```text
Structured validation: similarity=100, passed=true
```

如果这一步失败，先不要排查 OpenCode；应先解决依赖、浏览器或项目服务问题。

## 4. 配置 OpenCode：最简单的方式

### 4.1 方式一：在项目目录直接使用

项目根目录已经包含 `opencode.json`：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "image2html": {
      "type": "local",
      "command": [
        "node",
        "F:\\code\\image2html\\dist\\mcp\\index.js"
      ],
      "cwd": "F:\\code\\image2html",
      "enabled": true
    }
  }
}
```

如果安装目录不是 `F:\code\image2html`，同时修改 `command` 第二项和 `cwd`。

然后运行：

```powershell
cd F:\code\image2html
opencode
```

OpenCode 会自动启动 MCP，**不需要你先手动运行 `node dist/mcp/index.js`**。

### 4.2 方式二：在任意业务项目中使用

要在其他项目中使用，请将同一个 `image2html` 配置合并到用户级文件：

```text
%USERPROFILE%\.config\opencode\opencode.jsonc
```

也就是放入已有配置的 `mcp` 对象中：

```json
{
  "mcp": {
    "image2html": {
      "type": "local",
      "command": [
        "node",
        "F:\\code\\image2html\\dist\\mcp\\index.js"
      ],
      "cwd": "F:\\code\\image2html",
      "enabled": true
    }
  }
}
```

不要覆盖已有的模型、插件或其他 MCP 配置。

`cwd` 必须保留为 image2html 安装目录，它决定 MCP 从哪里读取 `.env`；你可以仍然在业务项目目录启动 OpenCode。

### 4.3 如果你的 OpenCode 使用 `mcp.servers`

部分新版本配置将服务放在 `mcp.servers` 下。此时使用下面的层级，不要与上面的 `mcp.image2html` 写法混用：

```json
{
  "mcp": {
    "servers": {
      "image2html": {
        "type": "local",
        "command": [
          "node",
          "F:\\code\\image2html\\dist\\mcp\\index.js"
        ],
        "cwd": "F:\\code\\image2html",
        "codemode": false
      }
    }
  }
}
```

`codemode: false` 便于直接查看五个原生工具；如果客户端不认识该字段，可删除它。

### 4.4 检查连接

修改配置后完全重启 OpenCode，再执行：

```powershell
opencode mcp list
```

正常结果：

```text
image2html connected
node F:\code\image2html\dist\mcp\index.js
```

如果显示 `Connection closed`，优先检查入口是否仍使用 `pnpm mcp`。当前推荐直接运行 Node 入口，避免终端没有 `pnpm` 或 PATH 不一致。

## 5. 第一次调用：先测试视觉校验

在 OpenCode 中发送下面的完整提示词：

```text
请先读取 F:\code\image2html\examples\demo\login-design.html，然后调用 image2html MCP 的 validate_design 工具。

参数：
original_image=F:\code\image2html\examples\demo\login-design.png
code=读取到的完整 HTML
framework=html
style_framework=inline
component_library=none
typescript=false
threshold=85

不要修改任何文件。请报告工具是否执行成功，以及 success、passed、similarity、quality 和 regions。
```

项目示例的预期结果是：

```text
success = true
passed = true
similarity = 100
```

这项测试不需要生成模型，适合确认 OpenCode、MCP、图片路径和 Chromium 均已正常工作。

## 6. 生成自己的组件

### 6.1 先用 fast 模式跑通

将路径替换为你的实际图片和业务项目文件路径：

```text
请调用 image2html 的 generate_component 工具。

image_path=F:\designs\dashboard.png
framework=react
style_framework=tailwind
component_library=antd
typescript=true
responsive=true
pipeline=direct
quality_mode=fast
layout_mode=single
asset_mode=none

拿到完整源码后，请使用编辑工具将 code 写入当前项目的 src\components\Dashboard.tsx。
请分别报告：工具执行是否成功、文件是否实际写入、视觉校验是否通过。
```

推荐第一次使用 `quality_mode=fast`，先确认生成链路正常；它仍然执行视觉校验，但不会自动进行多轮视觉修复。

### 6.2 常用参数速查

| 参数 | 常用值 | 推荐选择 |
| --- | --- | --- |
| `framework` | `react`、`vue`、`html` | 与业务项目一致 |
| `style_framework` | `tailwind`、`inline` | React/Vue 常用这两种 |
| `component_library` | `antd`、`element`、`none` | React 用 `antd`，Vue 用 `element`，HTML 用 `none` |
| `typescript` | `true`、`false` | 与项目源码一致 |
| `pipeline` | `direct`、`structured` | 先用 `direct`；需要结构审计再用 `structured` |
| `quality_mode` | `fast`、`balanced`、`precision` | 先 `fast`，需要自动修复时用后两种 |
| `layout_mode` | `single`、`segmented` | 普通页面用 `single`，长页面可试 `segmented` |
| `asset_mode` | `none`、`extract` | 需要分离 Logo/图片时才用 `extract` |

常用合法组合：

| 目标 | 推荐组合 |
| --- | --- |
| React | `react + tailwind/inline + antd` |
| Vue | `vue + tailwind/inline + element` |
| HTML | `html + inline + none + typescript=false` |

### 6.3 生成后必须检查四件事

1. `success=true`：工具生成流程成功。
2. OpenCode 确实把源码写入了目标文件。
3. 业务项目能够安装依赖并构建。
4. `validation.passed=true`：视觉门禁通过。

这四件事不能互相替代。工具生成成功但不会自行写入业务文件；文件写入成功也不代表构建或视觉验收通过。

## 7. 视觉未通过时如何修复

```text
请调用 image2html 的 repair_component，使用同一张原始图片和当前完整源码。

framework=react
style_framework=tailwind
component_library=antd
typescript=true
quality_mode=precision

工具会自动执行当前校验、视觉修复、候选重新校验和质量择优。
请读取最终 validation、repairIterations 和 qualityHistory，将实际采用的 code 写回 src\components\Dashboard.tsx。
最后运行项目构建；如果 passed 仍为 false，请如实报告，不要宣称验收通过。
```

修复预算：

| 模式 | 最大视觉修复预算 |
| --- | ---: |
| `fast` | 0 轮 |
| `balanced` | 2 轮 |
| `precision` | 4 轮 |

实际轮次还受 `.env` 中 `MAX_RETRY_COUNT` 限制。候选质量分数没有提高时，工具会保留原来的较优版本。

旧参数 `diff_regions` 仍可传递，也可以直接使用 `validate_design` 返回的 `structuredContent.regions`；新修复流程会重新校验，不要求你手工整理差异文本。

## 8. 结构分析和资源提取

### 8.1 只分析结构，不生成代码

```text
请调用 image2html 的 analyze_structure。
image_path=F:\designs\dashboard.png
请读取 structuredContent.structure，总结页面区域、组件、布局方向和 Design Token，不要修改业务代码。
```

### 8.2 提取 Logo 和图片

```text
请调用 image2html 的 extract_assets。
image_path=F:\designs\dashboard.png
output_dir=F:\designs\dashboard-assets
请返回 outputDir 和 paths，并列出实际生成的文件。
```

`extract_assets` 会真实创建 PNG 文件。其他生成和修复工具不会自行写入业务项目。

## 9. 结构化结果怎么读

所有工具都保留可读的 `content` 文本，并提供程序可读的 `structuredContent`。

生成结果的核心字段：

```json
{
  "success": true,
  "code": "完整源码",
  "filename": "Dashboard.tsx",
  "imports": ["react", "antd"],
  "components": ["Dashboard"],
  "validation": {
    "passed": false,
    "similarity": 90,
    "regions": [],
    "suggestions": []
  },
  "metrics": {
    "modelCalls": 1,
    "repairIterations": 0
  }
}
```

截图和差异图的 base64 不会放入结构化结果，避免占用过多 AI 上下文。

工具执行失败时会看到：

```json
{
  "success": false,
  "error": {
    "code": "FILE_NOT_FOUND",
    "message": "文件不存在: ..."
  }
}
```

同时 `isError=true`。注意：**视觉校验未通过不是工具错误**。此时通常仍是 `success=true`、`passed=false`，应根据质量报告继续修复。

## 10. Codex 配置

Codex 用户级配置文件：

```text
~/.codex/config.toml
```

Windows 通常是：

```text
%USERPROFILE%\.codex\config.toml
```

加入：

```toml
[mcp_servers.design-to-code]
command = "node"
args = ['F:\code\image2html\dist\mcp\index.js']
cwd = 'F:\code\image2html'
startup_timeout_sec = 30
tool_timeout_sec = 600
```

macOS / Linux 将路径换成实际安装目录：

```toml
[mcp_servers.design-to-code]
command = "node"
args = ["/absolute/path/to/image2html/dist/mcp/index.js"]
cwd = "/absolute/path/to/image2html"
startup_timeout_sec = 30
tool_timeout_sec = 600
```

重启 Codex 后检查：

```bash
codex mcp list
```

`cwd` 同样用于读取 image2html 安装目录的 `.env`。后续提示词与 OpenCode 示例相同，只需把服务名换成 `design-to-code`。

## 11. 公司内网多人使用

### 11.1 管理员部署集中服务

服务器配置模型变量和每位用户的独立密钥：

```env
API_KEYS=alice:replace-with-a-long-random-secret,bob:replace-with-another-long-random-secret
HOST=0.0.0.0
PORT=3000
DATA_DIR=data
JOB_CONCURRENCY=2
```

启动：

```bash
pnpm build
pnpm serve
```

生产环境建议通过 Nginx 或公司网关启用 HTTPS。当前队列位于单个 Node.js 进程中，不要直接启动多个副本。详细部署见[部署指南](deployment.md)。

### 11.2 用户配置远程适配器

每位用户只配置公司服务地址和自己的密钥：

```env
IMAGE2HTML_URL=https://image2html.internal.example
IMAGE2HTML_API_KEY=replace-with-personal-key
IMAGE2HTML_POLL_INTERVAL_MS=1000
IMAGE2HTML_TIMEOUT_MS=600000
```

OpenCode 使用远程入口：

```json
{
  "mcp": {
    "image2html": {
      "type": "local",
      "command": [
        "node",
        "F:\\code\\image2html\\dist\\mcp\\remote-index.js"
      ],
      "cwd": "F:\\code\\image2html",
      "enabled": true,
      "environment": {
        "IMAGE2HTML_URL": "{env:IMAGE2HTML_URL}",
        "IMAGE2HTML_API_KEY": "{env:IMAGE2HTML_API_KEY}"
      }
    }
  }
}
```

远程适配器执行：上传本机图片、轮询集中任务、下载源码和精简校验结果。模型密钥和 Chromium 只留在服务器侧。

当前远程模式只开放 `generate_component`，不支持 `asset_mode=extract`。校验、修复、结构分析和资源提取仍使用本地入口。它不是原生 HTTP MCP 端点，不要把 `IMAGE2HTML_URL` 直接填到客户端的远程 MCP `url` 字段。

## 12. 常见问题：按现象处理

| 现象 | 最常见原因 | 处理方法 |
| --- | --- | --- |
| `opencode` 不是可执行命令 | 未安装或未加入 PATH | 安装 `opencode-ai`，重新打开终端 |
| `image2html failed / Connection closed` | 配置仍调用不存在的 `pnpm`，或入口不存在 | 改为直接运行 `node ...\dist\mcp\index.js`，先执行构建 |
| OpenCode 看不到工具 | 配置层级错误、未重启或工具被隐藏 | 检查 `mcp.image2html` 与 `mcp.servers` 是否混用，重启并运行 `opencode mcp list` |
| 工具提示文件不存在 | 使用了相对路径或路径不在 MCP 所在机器 | 改用 MCP 机器可访问的绝对图片路径 |
| 请求仍发往默认 `.internal` 地址 | `.env` 未加载或变量名错误 | 检查 `cwd`、`.env` 和六个 `LLM` 变量 |
| 模型返回 401/403 | 模型密钥无效或权限不足 | 分别检查视觉模型和通用模型密钥 |
| 远程服务返回 401 | 个人 API 密钥错误 | 检查 `IMAGE2HTML_API_KEY`，不要使用模型密钥代替 |
| Chromium 启动失败 | 浏览器未安装或路径无效 | 执行 `pnpm exec playwright install chromium`，或设置 Chrome 路径 |
| 工具执行超时 | 模型生成和浏览器校验耗时较长 | 先用 `fast`，再按客户端文档提高工具超时 |
| 生成成功但 `passed=false` | 整图、内容、边缘等质量门禁未全部通过 | 查看 `quality`、`regions`、`suggestions`，再执行有界修复 |
| 对话中有源码但项目没文件 | MCP 本身不写业务文件 | 明确要求 OpenCode 使用编辑工具写入目标路径 |
| 返回 98% 以上仍未通过 | 通过条件不只有整图相似度 | 以最终 `passed` 和完整质量门禁为准 |

## 13. 安全与文件边界

- 不要把 `.env`、真实模型密钥或个人 API 密钥提交到 Git。
- 不要把真实密钥写进 `opencode.json`、提示词、日志或公开截图。
- 公司多人使用时，每人使用独立密钥，不要共享管理员密钥。
- 本地 MCP 能读取进程有权限访问的图片，并向指定目录提取资源；只使用可信配置和目录。
- 远程适配器会把本机图片上传到公司服务，使用前确认图片允许进入该服务。
- 生成、校验和修复结果都需要结合业务项目构建及人工验收，不能只看一段成功文本。

## 14. 最短验收清单

按顺序确认：

- [ ] `node scripts/verify-mcp.mjs` 成功。
- [ ] `opencode mcp list` 显示 `image2html connected`。
- [ ] OpenCode 调用示例 `validate_design` 返回 100%。
- [ ] 自己的图片使用绝对路径。
- [ ] `generate_component` 返回完整源码。
- [ ] OpenCode 将源码写入预期业务文件。
- [ ] 业务项目构建通过。
- [ ] 最终 `validation.passed=true`，或如实记录未通过原因。

完成前四项，说明 OpenCode 与 MCP 的基本链路已经打通；完成全部项目，才说明生成结果已接入并通过当前质量检查。

## 15. 常用命令速查

```powershell
# 进入安装目录
cd F:\code\image2html

# 安装、构建
pnpm install
pnpm exec playwright install chromium
pnpm build

# 服务自检
node scripts\verify-mcp.mjs

# OpenCode 连接检查
opencode mcp list

# 本地 MCP 入口（通常由 OpenCode 自动启动）
node dist\mcp\index.js

# 公司内网远程生成入口（通常由 OpenCode 自动启动）
node dist\mcp\remote-index.js
```

更多客户端字段和高级选项见[使用及 AI 工具接入指导](usage-and-ai-integration.md)，MCP 工具示例见[使用示例](../examples/mcp-usage.md)。
