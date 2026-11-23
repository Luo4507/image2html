# 多用户服务器部署指南

## 适用架构

当前版本适用于公司内网的**单实例、多用户**部署。HTTP API 负责用户鉴权和文件上传，有界任务队列控制模型及浏览器并发，任务产物保存在服务器目录中。

```text
用户 / Codex / OpenCode / 内部系统
                ↓ HTTPS
          Nginx / API 网关
                ↓
        image2html HTTP 服务
          ├── 异步任务队列
          ├── 模型服务（已部署）
          └── Chromium 视觉校验
```

> 当前队列和在线任务状态位于单个 Node.js 进程中，不应直接启动多个副本。需要多实例时，应先将队列和状态迁移到 Redis，并使用共享对象存储。

## 配置

复制环境变量模板：

```bash
cp .env.example .env
```

至少配置：

```env
LLM_VL_BASE_URL=http://vision-model.internal/v1
LLM_VL_API_KEY=replace-me
LLM_VL_MODEL=your-vision-model-name
LLM_BASE_URL=http://code-model.internal/v1
LLM_API_KEY=replace-me
LLM_MODEL=your-code-model-name

API_KEYS=alice:long-random-secret,bob:another-long-random-secret
JOB_CONCURRENCY=2
DATA_DIR=data
JOB_RETENTION_HOURS=168
```

`API_KEYS` 使用 `用户标识:密钥`，多个用户使用英文逗号分隔。每个用户必须拥有不同的长随机密钥。不要将 `.env` 提交到 Git。

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | 监听地址 |
| `PORT` | `3000` | HTTP 端口 |
| `DATA_DIR` | `data` | 上传、任务和产物目录 |
| `MAX_UPLOAD_MB` | `10` | 单张图片大小上限 |
| `JOB_CONCURRENCY` | `2` | 同时执行的模型/浏览器任务数 |
| `MAX_QUEUE_SIZE` | `100` | 等待队列长度 |
| `RATE_LIMIT_PER_MINUTE` | `60` | 单用户每分钟请求上限 |
| `JOB_RETENTION_HOURS` | `168` | 已完成/失败任务的保留小时数，`0` 表示不自动清理 |

## 本地启动

```bash
pnpm install
pnpm exec playwright install chromium
pnpm build
pnpm serve
```

检查：

```bash
curl http://localhost:3000/health
```

## Docker 启动

```bash
docker compose build
docker compose up -d
docker compose ps
```

Docker 镜像包含生产依赖和 Chromium。任务数据保存在 `image2html-data` 卷中。升级前先备份该卷。

## HTTP API

所有 `/v1/*` 和 `/mcp` 接口需要：

```text
Authorization: Bearer <用户密钥>
```

### 创建转换任务

```bash
curl -X POST http://localhost:3000/v1/jobs \
  -H "Authorization: Bearer long-random-secret" \
  -F "image=@examples/login.png" \
  -F "framework=html" \
  -F "styleFramework=inline" \
  -F "componentLibrary=none" \
  -F "typescript=false" \
  -F "validate=true"
```

成功返回 HTTP `202`：

```json
{
  "job": {
    "id": "job-id",
    "status": "queued",
    "createdAt": "2026-11-10T00:00:00.000Z"
  }
}
```

支持的图片类型：PNG、JPEG、WebP。生成选项：`framework=react|vue|html`、`styleFramework=tailwind|scss|css-modules|inline`、`componentLibrary=antd|element|none`、`typescript`、`responsive`、`accessibility`、`pipeline=direct|structured`、`qualityMode=fast|balanced|precision`、`layoutMode=single|segmented|auto`、`assetMode=none|extract`。非法框架、样式或组件库组合返回 HTTP 400；React/Vue 仅支持 `tailwind` 或 `inline`，HTML 支持四种样式方案。未显式指定组件库时，HTML 默认 none、Vue 默认 element、React 默认 antd。

### 查询任务

```bash
curl http://localhost:3000/v1/jobs/job-id \
  -H "Authorization: Bearer long-random-secret"
```

任务状态：`queued`、`running`、`succeeded`、`failed`。成功后，`job.result.artifacts` 包含代码下载地址；结构、校验报告、渲染截图和差异图等产物会根据生成流程及校验结果提供，并非每个任务都包含全部类型。

### 下载产物

```bash
curl -fL -o component.html http://localhost:3000/v1/jobs/job-id/artifacts/code \
  -H "Authorization: Bearer long-random-secret"
```

用户只能查询和下载自己创建的任务。其他用户的任务统一返回 `404`，避免暴露任务是否存在。

任务结果还包含 `imports`、`components` 和精简 `validation`，供内网 MCP 适配器组装结构化生成结果；这些字段不包含截图或差异图 base64。完整图片仍通过对应产物接口下载。

### OpenCode 原生远程 MCP（推荐）

服务在 `/mcp` 提供 Streamable HTTP MCP，使用与 `/v1/*` 相同的 `Authorization: Bearer <用户密钥>` 鉴权、限流、任务队列和用户隔离。OpenCode 机器不需要项目源码、Node.js、模型密钥或 Chromium。

```json
{
  "mcp": {
    "servers": {
      "image2html": {
        "type": "remote",
        "url": "https://image2html.example.com/mcp",
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

远程端点开放全部五个工具。生成、结构分析和资源提取使用 `image_path` 或 `image_base64`，独立校验和修复使用 `original_image` 或 `original_image_base64`。OpenCode 本机图片应使用 Base64，只有服务端可见路径才使用路径参数。生成任务的 `asset_mode` 保持 `none`，分离资源通过 `extract_assets` 返回 Base64 图片。完整客户端配置见[使用及 AI 工具接入指导](usage-and-ai-integration.md)。

### Codex / 旧客户端 stdio 适配器

需要 stdio 的客户端仍可将 `dist/mcp/remote-index.js` 配置为本地入口，并设置 `IMAGE2HTML_URL`、`IMAGE2HTML_API_KEY`。该入口是兼容适配器，不是原生远程 MCP；`IMAGE2HTML_URL` 使用服务根地址，不包含 `/mcp`。

### 实时进度与代码预览

```text
GET /v1/jobs/:id/events    SSE 进度事件
GET /v1/jobs/:id/preview   当前最新代码快照
```

两个接口都需要相同的用户密钥。SSE 会推送 `reading`、`analyzing`、`generating`、`preview`、`validating`、`repairing`、`completed` 或 `failed` 事件；`preview` 事件携带代码快照。客户端断开后，服务器自动清理订阅。

## 重启恢复

服务启动时会读取 `DATA_DIR/jobs`：

- 成功任务恢复查询状态与已有产物下载，失败任务恢复状态与错误信息；
- 原队列中或运行中的任务在输入记录存在时重新入队，并使用保存的 `input.json` 与可用源图重新执行；缺少 `input.json` 的未完成任务会标记为失败；
- 成功任务的输入、源图和 `conversion.json` 完整时可恢复转换缓存，相同图片、选项、模型和校验配置可直接命中，不再调用模型；缺少缓存文件不影响已有任务状态和产物查询。

恢复仍是单进程语义，不支持多实例共享队列或分布式锁。

## 生产检查

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm verify:mcp
pnpm verify:server
```

`verify:server` 会启动真实服务、创建转换任务、轮询状态并下载生成的 HTML。它会真实调用已配置的模型，并将验证数据写入 `output/server-verification`；执行前需确保模型服务和 Chromium 可用。

## 运维建议

- 在 Nginx/API 网关启用 HTTPS，并同步设置上传大小和较长请求超时。
- 模型生成可能需要数分钟；客户端应轮询任务，而不是保持长时间同步请求。
- 4 核 8GB 可作为小规模部署起点，先将 `JOB_CONCURRENCY` 设置为 `1` 或 `2`。
- 上传图片复制到任务目录后，会自动删除 `DATA_DIR/uploads` 中的原始副本。服务启动时及运行期间每小时自动清理超过 `JOB_RETENTION_HOURS` 的已完成或失败任务；排队和运行中的任务不会清理。
- 重启前可等待活动任务完成，减少重复执行；持久化任务的恢复规则见上文。
- 多实例、高可用和跨服务器执行需要 Redis 队列、共享存储及集中任务状态，当前版本不包含这些能力。

## 转换缓存

HTTP 服务在单实例内存中按图片内容哈希、生成选项、模型配置和校验配置复用成功的转换结果，最多保留最近 32 项。输入、源图和 `conversion.json` 完整的成功任务会在重启后重建缓存，因此缓存可以跨重启命中，但不能跨进程或多实例共享。失败结果不会缓存。每个缓存命中任务仍会生成独立的事件、预览和产物目录，不会向其他用户暴露原任务。

命中结果的阶段耗时与模型调用数归零，并设置 `metrics.cacheHit: true`。多实例部署不会自动共享缓存，如需跨实例复用应改为外部缓存，并继续保持产物按用户和任务隔离。
