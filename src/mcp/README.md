# Design-to-Code MCP

为 OpenCode、Codex、Cursor 等 AI 工具提供设计稿转代码能力。项目支持两种入口：

| 入口 | 用途 | 可用工具 |
| --- | --- | --- |
| `dist/mcp/index.js` | 本地模型调用、浏览器校验与文件处理 | 全部五个工具 |
| `dist/mcp/remote-index.js` | 本地 stdio 适配器连接公司集中 HTTP 服务 | 仅 `generate_component` |

两种入口都使用 stdio。远程适配器不是原生 HTTP MCP 端点，不要把 `IMAGE2HTML_URL` 直接填成 MCP 客户端的远程 URL。

## 安装

```bash
pnpm install
pnpm build
```

本地五工具模式需要模型服务与 Playwright Chromium。远程生成模式只需要公司服务地址和个人 API 密钥，模型与 Chromium 运行在服务器侧。

## 本地工具

- `generate_component`：生成 HTML、React 或 Vue 代码，支持 direct/structured、质量模式、分段生成、校验和自动修复。
- `validate_design`：真实渲染并比较设计稿，返回相似度、质量指标、差异区域和建议。
- `repair_component`：先校验当前代码，再执行视觉修复、候选重新校验和质量择优。
- `analyze_structure`：在 `structure` 字段返回页面结构对象。
- `extract_assets`：识别并裁剪 PNG 资源，真实写入输出目录。

本地启动：

```bash
pnpm mcp
```

AI 客户端通常负责启动这个进程，不需要在终端长期运行。完整的 OpenCode V1/V2、Codex 和 Cursor 配置见[使用及 AI 工具接入指导](../../docs/usage-and-ai-integration.md)。

## 结构化结果与兼容性

所有工具同时返回：

- `content`：原有的人类可读文本，保留给现有调用方。
- `structuredContent`：供程序直接读取的对象。
- 工具列表中的 `outputSchema`：描述结构化结果。

生成结果示例：

```json
{
  "success": true,
  "code": "export default function Demo() {}",
  "filename": "Demo.tsx",
  "imports": ["react"],
  "components": ["Demo"],
  "validation": {
    "passed": false,
    "similarity": 78.2,
    "regions": [],
    "suggestions": []
  },
  "metrics": {
    "modelCalls": 2,
    "repairIterations": 1
  }
}
```

`validate_design` 将校验字段直接放在顶层，`regions` 可以直接作为 `repair_component.diff_regions` 传入。结构分析使用 `structure` 字段，资源提取使用 `outputDir` 和 `paths` 字段。

结构化校验结果不包含 `screenshots` 或 `diffImage`，避免把大段 base64 注入 AI 上下文。

### 错误语义

文件不存在、生成失败、请求异常等情况返回：

```json
{
  "success": false,
  "error": {
    "code": "FILE_NOT_FOUND",
    "message": "文件不存在: ..."
  }
}
```

同时设置 `isError: true`。常见错误码包括 `FILE_NOT_FOUND`、`GENERATION_FAILED`、`REPAIR_FAILED`、`TOOL_EXECUTION_FAILED`、`REMOTE_UNAUTHORIZED`、`REMOTE_RATE_LIMITED` 和 `REMOTE_TIMEOUT`。

视觉校验未通过不是协议错误：`validate_design` 此时仍返回 `success: true`、`passed: false`，且不设置 `isError`。生成成功也不等于视觉门禁通过。

## 独立修复参数

必填：

- `original_image`：原图路径。
- `code`：当前完整源码。

可选：

- `diff_regions`：兼容旧调用；修复流程会重新校验并使用实时差异。
- `framework`、`style_framework`、`component_library`、`typescript`：必须与目标代码一致。
- `quality_mode`：`fast`（0 轮）、`balanced`（最多 2 轮）、`precision`（最多 4 轮）；默认 `precision`。
- `max_iterations`：显式轮次上限，仍受服务端 `MAX_RETRY_COUNT` 限制。
- `threshold`：本次整图相似度阈值。

返回 `code`、最终 `validation`、`repairIterations`、精简 `qualityHistory` 和 `metrics`。候选没有提升质量分数时不会被采用。

## 公司内网远程生成

架构：

```text
OpenCode / Codex
      │ stdio
      ▼
dist/mcp/remote-index.js
      │ HTTPS + 个人 Bearer API 密钥
      ▼
公司 image2html 单实例 HTTP 服务
      ├── 用户鉴权与限流
      ├── 有界任务队列
      ├── 内网模型与 Chromium
      └── 按用户隔离的任务产物
```

在运行 AI 客户端的用户机器上配置：

```env
IMAGE2HTML_URL=https://image2html.internal.example
IMAGE2HTML_API_KEY=replace-with-personal-key
IMAGE2HTML_POLL_INTERVAL_MS=1000
IMAGE2HTML_TIMEOUT_MS=600000
```

启动命令：

```bash
pnpm mcp:remote
```

OpenCode V2 示例：

```json
{
  "mcp": {
    "servers": {
      "design-to-code": {
        "type": "local",
        "command": ["node", "/absolute/path/to/image2html/dist/mcp/remote-index.js"],
        "cwd": "/absolute/path/to/image2html",
        "environment": {
          "IMAGE2HTML_URL": "{env:IMAGE2HTML_URL}",
          "IMAGE2HTML_API_KEY": "{env:IMAGE2HTML_API_KEY}"
        }
      }
    }
  }
}
```

Codex 示例：

```toml
[mcp_servers.design-to-code]
command = "node"
args = ["/absolute/path/to/image2html/dist/mcp/remote-index.js"]
cwd = "/absolute/path/to/image2html"
env_vars = ["IMAGE2HTML_URL", "IMAGE2HTML_API_KEY"]
startup_timeout_sec = 30
tool_timeout_sec = 600
```

远程适配器只开放 `generate_component`，会上传本机图片、轮询任务并下载源码与精简校验结果。`asset_mode=extract` 不受支持；独立校验、修复、结构分析和资源提取仍使用本地 MCP。个人密钥只通过环境变量提供，不要写入源码、日志或 Git。
