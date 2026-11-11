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
  -F "image=@examples/fixtures/demo/login.png" \
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

支持的图片类型：PNG、JPEG、WebP。其他选项：`framework=react|vue|html`、`styleFramework=tailwind|scss|css-modules|inline`、`componentLibrary=antd|element|none`。

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
