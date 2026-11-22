# Design-to-Code MCP

为 OpenCode、Codex、Cursor 等 AI 工具提供设计稿转代码能力。项目支持三种入口：

| 入口 | 用途 | 可用工具 |
| --- | --- | --- |
| HTTP 服务 `/mcp` | OpenCode 通过 Streamable HTTP 原生远程调用 | 全部五个工具 |
| `dist/mcp/index.js` | 本地模型调用、浏览器校验与文件处理 | 全部五个工具 |
| `dist/mcp/remote-index.js` | 本地 stdio 适配器连接公司集中 HTTP 服务 | 全部五个工具 |

两个 Node.js 入口使用 stdio；`/mcp` 是原生远程端点。远程适配器的 `IMAGE2HTML_URL` 使用服务根地址，OpenCode 远程配置的 `url` 则以 `/mcp` 结尾，两者不要混用。

## 安装

```bash
pnpm install
pnpm build
```

本地五工具模式需要模型服务与 Playwright Chromium。远程五工具模式只需要公司服务地址和个人 API 密钥，模型与 Chromium 运行在服务器侧。

## 五个工具

- `generate_component`：生成 HTML、React 或 Vue 代码，支持 direct/structured、质量模式、分段生成、校验和自动修复。
- `validate_design`：真实渲染并比较设计稿，返回相似度、质量指标、差异区域和建议。
- `repair_component`：先校验当前代码，再执行视觉修复、候选重新校验和质量择优。
- `analyze_structure`：在 `structure` 字段返回页面结构对象。
- `extract_assets`：识别并裁剪 PNG 资源；本地模式写入输出目录，远程模式通过 Base64 返回图片。

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

`validate_design` 将校验字段直接放在顶层，`regions` 可以直接作为 `repair_component.diff_regions` 传入。结构分析使用 `structure` 字段。本地资源提取使用 `outputDir` 和 `paths` 字段；远程资源提取使用 `assets` 字段。

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

- `original_image`：本地或服务端可见的原图路径；远程调用也可使用 `original_image_base64`。
- `code`：当前完整源码。

可选：

- `diff_regions`：兼容旧调用；修复流程会重新校验并使用实时差异。
- `framework`、`style_framework`、`component_library`、`typescript`：必须与目标代码一致。
- `quality_mode`：`fast`（0 轮）、`balanced`（最多 2 轮）、`precision`（最多 4 轮）；默认 `precision`。
- `max_iterations`：显式轮次上限，仍受服务端 `MAX_RETRY_COUNT` 限制。
- `threshold`：本次整图相似度阈值。

返回 `code`、最终 `validation`、`repairIterations`、精简 `qualityHistory` 和 `metrics`。候选没有提升质量分数时不会被采用。

## 公司内网原生远程 MCP

架构：

```text
OpenCode
      │ Streamable HTTP + 个人 Bearer API 密钥
      ▼
公司 image2html /mcp
      ├── 用户鉴权与限流
      ├── 有界生成任务队列
      ├── 内网模型与 Chromium
      └── 按用户隔离的任务产物
```

OpenCode V2 配置：

```json
{
  "mcp": {
    "servers": {
      "image2html": {
        "type": "remote",
        "url": "https://image2html.internal.example/mcp",
        "oauth": false,
        "headers": {
          "Authorization": "Bearer {env:IMAGE2HTML_API_KEY}"
        },
        "codemode": false,
        "timeout": { "execution": 600000 }
      }
    }
  }
}
```

远程端点开放全部五个工具：

- 生成、结构分析和资源提取：使用 `image_path` 或 `image_base64`。
- 独立校验和修复：使用 `original_image` 或 `original_image_base64`，并提供 `code`。
- 纯 Base64 输入同时提供 `image_filename`；Data URL 可以自动识别图片格式。
- 本机文件应使用 Base64；路径参数只适用于运行当前 MCP 入口的机器可见文件系统。
- 生成任务的 `asset_mode` 保持 `none`，需要分离图片时调用 `extract_assets`。

远程 `extract_assets` 忽略 `output_dir`，返回：

```json
{
  "success": true,
  "assets": [
    {
      "name": "logo.png",
      "mimeType": "image/png",
      "data": "iVBORw0KGgoAAAANS..."
    }
  ]
}
```

`data` 是不带 Data URL 前缀的纯 Base64，AI 客户端可解码后写入当前项目。个人密钥只通过环境变量提供，不要写入源码、日志或 Git。

## 兼容 stdio 远程适配器

旧客户端仍可使用 `dist/mcp/remote-index.js`，它通过 `IMAGE2HTML_URL`、`IMAGE2HTML_API_KEY` 连接服务根地址。生成工具执行图片上传、任务轮询和源码下载，其余四个工具通过 `/v1/tools/*` 调用同一套服务端实现。Codex 配置：

```toml
[mcp_servers.design-to-code]
command = "node"
args = ["/absolute/path/to/image2html/dist/mcp/remote-index.js"]
cwd = "/absolute/path/to/image2html"
env_vars = ["IMAGE2HTML_URL", "IMAGE2HTML_API_KEY"]
startup_timeout_sec = 30
tool_timeout_sec = 600
```

适配器同样开放全部五个工具，支持本机路径或 Base64 图片。它不是原生 HTTP MCP 端点，`IMAGE2HTML_URL` 不应包含 `/mcp`。
