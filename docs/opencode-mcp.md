# OpenCode MCP 配置

## 当前运行方式

Docker 容器提供 HTTP 服务。OpenCode 在本机启动 MCP 并读取项目根目录 `.env`，这样可以访问任意前端项目中的设计稿文件。

- HTTP 地址：`http://localhost:3000`
- MCP 配置文件：项目根目录 `opencode.json`

## 启动

```powershell
cd F:\code\image2html
docker compose up -d
docker compose ps
```

确认容器状态为 `healthy`。

## 配置 OpenCode

在项目根目录运行 OpenCode 时，会自动读取项目根目录的 `opencode.json`。

如需全局使用，将以下内容合并到 `C:\Users\lenovo\.config\opencode\opencode.jsonc` 的 `mcp` 中：

```json
{
  "image2html": {
    "type": "local",
    "command": [
      "cmd",
      "/c",
      "cd /d F:\\code\\image2html && pnpm mcp"
    ],
    "enabled": true
  }
}
```

不要覆盖配置文件中已有的模型和其他 MCP 配置。

## 验证

重启 OpenCode 后执行：

```bash
opencode mcp list
```

或在 OpenCode 会话中输入：

```text
请使用 image2html 的 analyze_structure 工具分析设计稿。
```

可用工具：`generate_component`、`validate_design`、`repair_component`、`analyze_structure`。

## 注意事项

- MCP 在本机运行，不依赖 Docker 容器；HTTP 服务才需要 Docker。
- 不要把模型密钥或用户密钥写入 `opencode.json`。
- 当前配置使用 OpenCode Desktop 1.18.x 的 `mcp.image2html` 结构；OpenCode V2 才需要额外的 `mcp.servers` 层。
- 此方式依赖本机 Docker。如需跨电脑直接连接服务器，需要单独实现远程 HTTP/SSE MCP Transport。
