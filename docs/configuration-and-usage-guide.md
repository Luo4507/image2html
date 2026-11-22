# image2html OpenCode 远程使用手册

给 OpenCode 一张设计图，让它按照当前项目的规范生成网页。

远程模式下，OpenCode 通过 URL 调用 image2html，不在你的电脑上启动 MCP 进程，也不需要安装项目依赖、模型或 Chromium。

## 1. 准备连接信息

你只需要两项信息：

- **MCP 地址**：本机 Docker 是 `http://localhost:3000/mcp`；公司服务使用管理员分配的地址，例如 `https://image2html.example.com/mcp`。
- **个人 API 密钥**：由服务管理员在服务端 `API_KEYS` 中分配。

地址末尾必须包含 `/mcp`。

## 2. 一次性配置

### 2.1 添加远程 MCP

本项目根目录的 `opencode.json` 已配置好，可以跳过这一步。

如果要在其他业务项目中使用，请将下面的 `mcp.servers.image2html` 合并到项目配置，或全局配置 `%USERPROFILE%\.config\opencode\opencode.jsonc`：

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

使用公司服务时，只需替换 `url`。请保留文件中已有的模型、插件和其他 MCP 配置，不要覆盖整个文件。

### 2.2 配置密钥

OpenCode V2 桌面版由后台服务连接 MCP。请在 PowerShell 中执行：

```powershell
opencode service set env IMAGE2HTML_API_KEY "你的个人密钥"
opencode service restart
```

这样密钥会提供给后台服务，不需要写进 `opencode.jsonc`。不要把真实密钥提交到 Git。

如果终端提示找不到 `opencode`，请使用桌面版自带的 `opencode-cli.exe` 完整路径，或将其所在目录加入 `PATH`。

## 3. 检查连接

```powershell
opencode mcp list
```

看到下面的结果即可开始使用：

```text
✓ image2html  connected
```

如果修改配置后状态没有刷新，请完全重启 OpenCode 再检查。

## 4. 一句话生成网页

把图片拖进 OpenCode，然后发送：

```text
把这张设计图生成网页，并接入当前项目。

请先识别项目的技术栈、目录结构和代码规范，再使用 image2html 完成转换，按照项目现有的开发方式编写并写入合适的位置。

完成后检查页面效果并运行项目构建，有问题继续调整。
```

如果图片已经在项目中，例如 `designs/dashboard.png`，可以直接说：

```text
根据 designs/dashboard.png 生成网页并接入当前项目。
遵循项目现有的技术栈、目录结构和代码规范，使用 image2html 完成转换。
完成后检查页面效果并运行构建，有问题继续调整。
```

你不需要手写 Base64、模型名称或框架参数，这些由 OpenCode 根据图片、项目上下文和工具说明处理。

## 5. 确认生成结果

生成完成后，检查三件事：

1. **文件**：组件或页面已写入项目，而不只是显示在对话里。
2. **构建**：项目构建或类型检查通过。
3. **效果**：页面与设计稿一致；如有偏差，让 OpenCode 继续调整。

工具返回 `success=true` 只表示生成完成，`validation.passed=true` 才表示通过当前视觉校验。

## 6. 常见问题

| 现象 | 处理方法 |
| --- | --- |
| `image2html failed` | 检查服务是否运行、URL 是否以 `/mcp` 结尾，再执行 `opencode service restart` |
| HTTP 401 或未授权 | 重新执行第 2.2 节的两条密钥命令，并确认密钥有效 |
| 提示需要 OAuth 登录 | 确认远程配置中包含 `oauth: false` |
| 提示图片不存在 | 确认 OpenCode 能读取图片，并提醒它将本机图片转为 Base64 后上传 |
| 未看到 5 个工具 | 执行 `opencode mcp list` 检查连接；已连接但仍缺少工具时，重启 OpenCode 并确认服务已更新到最新版本 |
| 对话中有代码，项目里没有文件 | 明确要求 OpenCode 将代码写入项目文件 |

## 7. 进阶文档

- [使用及 AI 工具接入指导](usage-and-ai-integration.md)：Codex、本地 MCP、参数说明和其他 AI 工具。
- [部署指南](deployment.md)：Docker、公司内网部署和多人密钥管理。
- [示例设计稿](../examples/README.md)：用于测试转换的现有图片。
