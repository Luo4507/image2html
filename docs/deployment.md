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
QWEN_VL_BASE_URL=http://vision-model.internal/v1
QWEN_VL_API_KEY=replace-me
VISION_MODEL=qwen-vl-plus
GLM_BASE_URL=http://code-model.internal/v1
GLM_API_KEY=replace-me
CODE_MODEL=qwen-flash

API_KEYS=alice:long-random-secret,bob:another-long-random-secret
JOB_CONCURRENCY=2
DATA_DIR=data
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

## 本地启动

```bash
pnpm install
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

所有 `/v1/*` 接口需要：

```text
Authorization: Bearer <用户密钥>
```

### 创建转换任务

```bash
curl -X POST http://localhost:3000/v1/jobs \
  -H "Authorization: Bearer long-random-secret" \
  -F "image=@examples/demo/login.png" \
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

支持的图片类型：PNG、JPEG、WebP。生成选项：`framework=react|vue|html`、`styleFramework=tailwind|scss|css-modules|inline`、`componentLibrary=antd|element|none`、`typescript`、`responsive`、`accessibility`、`pipeline=direct|structured`、`qualityMode=fast|balanced|precision`、`layoutMode=single|segmented`、`assetMode=none|extract`。非法框架/组件库组合返回 HTTP 400；未显式指定组件库时，HTML 默认 none、Vue 默认 element、React 默认 antd。

### 查询任务

```bash
curl http://localhost:3000/v1/jobs/job-id \
  -H "Authorization: Bearer long-random-secret"
```

任务状态：`queued`、`running`、`succeeded`、`failed`。完成后，`job.result.artifacts` 包含代码、结构、校验报告、渲染截图和差异图的下载地址。

### 下载产物

```bash
curl -O http://localhost:3000/v1/jobs/job-id/artifacts/code \
  -H "Authorization: Bearer long-random-secret"
```

用户只能查询和下载自己创建的任务。其他用户的任务统一返回 `404`，避免暴露任务是否存在。

### 实时进度与预览

```text
GET /v1/jobs/:id/events    SSE 进度事件
GET /v1/jobs/:id/preview   当前最新 HTML 预览
```

两个接口都需要相同的用户密钥。SSE 会推送 `reading`、`generating`、`preview`、`validating`、`repairing`、`completed` 或 `failed` 事件；`preview` 事件携带代码快照。客户端断开后，服务器自动清理订阅。

## 重启恢复

服务启动时会读取 `DATA_DIR/jobs`：

- 已完成和失败任务恢复查询状态与产物下载；
- 原队列中或运行中的任务恢复为队列任务，并使用保存的 `input.json` 与 `source.png` 重新执行；
- 成功任务的 `conversion.json` 用于恢复转换缓存，相同图片、选项、模型和校验配置可直接命中，不再调用模型；
- 旧版本缺少 `input.json` 或 `conversion.json` 时仍恢复已有状态，但不恢复对应执行或缓存能力。

恢复仍是单进程语义，不支持多实例共享队列或分布式锁。

## 生产检查

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm verify:mcp
pnpm verify:server
```

`verify:server` 会启动真实服务、创建转换任务、轮询状态并下载生成的 HTML。

## 运维建议

- 在 Nginx/API 网关启用 HTTPS，并同步设置上传大小和较长请求超时。
- 模型生成可能需要数分钟；客户端应轮询任务，而不是保持长时间同步请求。
- 4 核 8GB 可作为小规模部署起点，先将 `JOB_CONCURRENCY` 设置为 `1` 或 `2`。
- 定期清理 `DATA_DIR/uploads` 中的异常残留文件及过期任务。
- 服务重启不会恢复内存中的排队任务；不要在没有任务时以外的方式直接重启。
- 多实例、高可用和跨服务器执行需要 Redis 队列、共享存储及集中任务状态，当前版本不包含这些能力。

## 转换缓存

HTTP 服务在单实例内存中按图片内容哈希、生成选项、模型配置和校验配置复用成功的转换结果，最多保留最近 32 项。缓存不会跨进程或重启保留；失败结果不会缓存。每个缓存命中任务仍会生成独立的事件、预览和产物目录，不会向其他用户暴露原任务。

命中结果的阶段耗时与模型调用数归零，并设置 `metrics.cacheHit: true`。多实例部署不会自动共享缓存，如需跨实例复用应改为外部缓存，并继续保持产物按用户和任务隔离。
