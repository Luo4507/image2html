# image2html 快速上手：OpenCode 远程 MCP

这份指南只做一件事：**让 OpenCode 通过 URL 调用远程 image2html MCP，不在本机启动 MCP 进程。**

连接方式：

```text
OpenCode → HTTP / HTTPS → image2html /mcp → 服务端模型与 Chromium
```

OpenCode 机器只需要 OpenCode V2、MCP 地址和个人 API 密钥。不需要安装项目依赖、配置模型或安装 Chromium。

## 1. 准备连接信息

向服务管理员确认两项信息：

- MCP 地址：本机 Docker 为 `http://localhost:3000/mcp`；公司服务类似 `https://image2html.example.com/mcp`。
- 个人 API 密钥：对应服务端 `API_KEYS` 中分配给你的密钥。

注意地址末尾必须包含 `/mcp`。`http://localhost:3000` 本身仍是 HTTP 任务服务地址，不是完整 MCP 端点。

## 2. 设置个人密钥

在 Windows PowerShell 中执行，把示例值替换成真实个人密钥：

```powershell
[Environment]::SetEnvironmentVariable("IMAGE2HTML_API_KEY", "replace-with-your-personal-key", "User")
```

完全关闭并重新打开 PowerShell 和 OpenCode，让新环境变量生效。不要把真实密钥写入 `opencode.json`、源码或 Git。

如果只在当前 PowerShell 窗口临时使用，可以执行：

```powershell
$env:IMAGE2HTML_API_KEY="replace-with-your-personal-key"
```

然后从同一个窗口启动 OpenCode。

## 3. 配置 OpenCode V2

项目根目录的 `opencode.json` 已提供相同配置。若要在任意业务项目中使用，将下面的 `mcp.servers.image2html` 合并到：

```text
%USERPROFILE%\.config\opencode\opencode.jsonc
```

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

使用公司服务时，只需要把 `url` 改成公司分配的地址。已有模型、插件或其他 MCP 配置必须保留，不要覆盖整个文件。

- `type: "remote"`：OpenCode 使用 Streamable HTTP，不启动本地 Node.js 进程。
- `oauth: false`：服务使用个人 API 密钥，不走 OAuth 登录。
- `headers`：从 OpenCode 所在机器的环境变量读取密钥。
- `codemode: false`：让 `generate_component` 直接出现在原生工具列表中。
- `timeout.execution`：远程生成最多等待 10 分钟。

## 4. 检查连接

完全重启 OpenCode，然后在 PowerShell 中执行：

```powershell
opencode mcp list
```

正常应显示：

```text
image2html connected
```

也可以在 OpenCode 中输入 `/mcps` 查看。远程模式只开放 `generate_component`，这是当前预期行为；独立校验、修复、结构分析和资源提取仍属于本地五工具入口。

## 5. 生成自己的组件

把图片路径和目标文件路径换成实际路径，然后在 OpenCode 中发送：

```text
请调用 image2html 远程 MCP 的 generate_component 工具。

先将 F:\designs\dashboard.png 转为 Base64，并按下面参数调用：
image_base64=data:image/png;base64,<图片的 Base64 内容>
image_filename=dashboard.png
framework=react
style_framework=tailwind
component_library=antd
typescript=true
responsive=true
pipeline=direct
quality_mode=precision
layout_mode=single
asset_mode=none

不要传 image_path，因为 OpenCode 本机路径在远程服务器或 Docker 容器中不存在。
拿到完整源码后，请使用编辑工具将 code 写入当前项目的 src\components\Dashboard.tsx。
请分别报告工具是否执行成功、文件是否实际写入、视觉校验是否通过。
```

JPEG 使用 `data:image/jpeg;base64,...`，WebP 使用 `data:image/webp;base64,...`。也可以只传纯 Base64 内容，但此时必须用 `image_filename` 提供正确扩展名。

默认 `quality_mode=precision` 会在生成过程中进行视觉校验和最多 4 轮修复，不需要另外调用 `repair_component`。其他框架参数：

- React：`react + tailwind + antd`
- Vue：`vue + tailwind + element`
- 纯 HTML：`html + inline + none + typescript=false`

`success=true` 只表示工具执行成功，`validation.passed=true` 才表示通过当前视觉质量检查。MCP 返回源码后，OpenCode 仍需将源码写入业务文件并运行项目构建。

## 6. 遇到问题怎么办

| 看到的现象 | 直接这样处理 |
| --- | --- |
| `image2html failed` 或无法连接 | 检查服务是否运行、URL 是否以 `/mcp` 结尾，并完全重启 OpenCode |
| HTTP 401 或提示未授权 | 检查 `IMAGE2HTML_API_KEY` 是否设置在 OpenCode 所在机器，以及密钥是否有效 |
| 提示需要 OAuth 登录 | 确认该服务配置中包含 `oauth: false` |
| 工具提示图片不存在 | 远程调用改用 `image_base64`，不要传 OpenCode 本机的 `image_path` |
| 只看到 `generate_component` | 正常；其余四个工具目前只由本地 MCP 提供 |
| `success=true` 但 `passed=false` | 连接和生成已成功，但视觉门禁未通过；查看差异建议并调整设计稿或重新生成 |
| 对话中有源码，但项目里没有文件 | 明确要求 OpenCode 使用编辑工具写入目标文件，MCP 不会自行写入业务项目 |

## 7. 进阶使用

- [使用及 AI 工具接入指导](usage-and-ai-integration.md)：Codex、本地五工具、旧版 OpenCode 和兼容适配器。
- [部署指南](deployment.md)：公司内网多人共享、API 密钥和服务部署。
- [示例设计稿](../examples/README.md)：可用于测试转换的现有图片。
