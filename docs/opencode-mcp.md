# OpenCode MCP 配置

> 第一次使用或需要完整故障排查时，推荐阅读[配置与使用指导手册](configuration-and-usage-guide.md)。

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
      "node",
      "F:\\code\\image2html\\dist\\mcp\\index.js"
    ],
    "cwd": "F:\\code\\image2html",
    "enabled": true
  }
}
```

不要覆盖配置文件中已有的模型和其他 MCP 配置。直接运行 Node 入口不依赖终端安装 `pnpm`，也避免 `cmd /c ... && pnpm mcp` 因 PATH 差异导致连接关闭。

## 验证

重启 OpenCode 后执行：

```bash
opencode mcp list
```

正常应显示 `image2html connected`。也可以在 OpenCode 会话中输入：

```text
请使用 image2html 的 validate_design 工具校验设计稿。
```

可用工具：`generate_component`、`validate_design`、`repair_component`、`analyze_structure`、`extract_assets`。

本次使用 OpenCode `1.19.6` 实测：`image2html` 连接成功；`validate_design` 返回相似度 100%；`generate_component` 真实调用模型并返回完整 HTML。生成结果的整图相似度为 98.96%，但最终 `passed=false`，说明其他质量门禁未全部满足，不属于 MCP 连接或生成失败。未据此声称其余工具均已在 OpenCode 中逐一实测。

## 注意事项

- MCP 在本机运行，不依赖 Docker 容器；HTTP 服务才需要 Docker。
- 不要把模型密钥或用户密钥写入 `opencode.json`。
- 当前 `mcp.image2html` 结构已在 OpenCode `1.19.6` 实测；采用 `mcp.servers` 的版本应按对应文档使用 V2 层级。
- 跨电脑共享可使用 `dist/mcp/remote-index.js` stdio 适配器连接集中 HTTP 服务，目前仅开放 `generate_component`；原生 Streamable HTTP MCP 端点仍不包含在当前版本中。
