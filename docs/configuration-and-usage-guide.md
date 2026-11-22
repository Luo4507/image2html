# image2html 快速上手

这份指南只做一件事：**让第一次使用的人尽快在 OpenCode 中跑通 image2html。**

默认环境为 Windows，示例安装目录是 `F:\code\image2html`。如果你的目录不同，把命令、配置和提示词中的路径换成实际路径即可。

> 你只需要按顺序操作。暂时不用了解 MCP 原理、结构化协议或部署架构。

## 1. 准备软件

请先安装：

- Node.js 20 或更高版本。
- pnpm 10。
- OpenCode。
- 两个兼容 OpenAI Chat Completions API 的模型服务：一个视觉模型，一个通用语言模型。

打开 PowerShell，检查前三个软件：

```powershell
node --version
pnpm --version
opencode --version
```

如果提示找不到 pnpm 或 OpenCode，可执行对应命令，然后重新打开终端：

```powershell
npm install -g pnpm@10
npm install -g opencode-ai
```

本指南使用当前 OpenCode V2 配置。如果仍使用 `1.19.6` 等 V1 版本，请改用[完整接入指导](usage-and-ai-integration.md)中的 V1 示例，不要混用两种配置层级。

## 2. 安装并填写模型配置

### 2.1 安装项目

已经下载项目的话，直接进入项目目录并执行 `pnpm install`，不用重复克隆。

```powershell
git clone https://github.com/Luo4507/image2html.git
cd image2html
pnpm install
Copy-Item .env.example .env
```

### 2.2 填写六个变量

用文本编辑器打开项目根目录的 `.env`，替换下面六项的值：

```env
# 视觉模型：负责读取设计稿
LLM_VL_BASE_URL=http://vision-model.internal/v1
LLM_VL_API_KEY=replace-with-your-vision-key
LLM_VL_MODEL=your-vision-model-name

# 通用语言模型：负责代码生成、修复等任务
LLM_BASE_URL=http://code-model.internal/v1
LLM_API_KEY=replace-with-your-code-key
LLM_MODEL=your-code-model-name
```

记忆方式：**`LLM_VL` 是视觉模型，`LLM` 是通用模型。** API 地址通常包含 `/v1`，模型名必须与模型服务实际提供的名称一致。

不要照抄示例中的 `.internal` 地址、密钥或模型名。`.env` 含真实密钥，不要提交到 Git。

## 3. 构建并自检

在项目目录执行：

```powershell
pnpm exec playwright install chromium
pnpm build
node scripts/verify-mcp.mjs
```

自检成功时会列出五个工具，并显示类似：

```text
Structured validation: similarity=100, passed=true
```

**这一步通过后再配置 OpenCode。** 如果失败，先看文末“遇到问题怎么办”。

## 4. 连接 OpenCode

### 4.1 检查配置

项目根目录已经包含 `opencode.json`。确认其中的 `image2html` 配置如下：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "image2html": {
        "type": "local",
        "command": ["node", "F:\\code\\image2html\\dist\\mcp\\index.js"],
        "cwd": "F:\\code\\image2html",
        "codemode": false
      }
    }
  }
}
```

如果安装目录不同，同时修改 `command` 第二项和 `cwd`：

- `command` 第二项：指向 MCP 入口文件。
- `cwd`：指向 image2html 安装目录，用于读取 `.env`。
- `codemode: false`：让五个工具直接出现在 OpenCode 的原生工具列表中。

要在其他业务项目中使用，把上面的 `mcp.servers.image2html` 配置合并到：

```text
%USERPROFILE%\.config\opencode\opencode.jsonc
```

不要覆盖已有的模型、插件或其他 MCP 配置；`cwd` 仍然指向 image2html 安装目录。

### 4.2 检查连接

完全重启 OpenCode，在 PowerShell 中执行：

```powershell
cd F:\code\image2html
opencode mcp list
```

看到下面这行就说明连接成功：

```text
image2html connected
```

OpenCode 会自动启动 MCP，**不需要另行运行 `node dist/mcp/index.js`**。

## 5. 第一次调用：校验项目示例

在 OpenCode 对话框中完整复制以下内容：

```text
请读取 F:\code\image2html\examples\login.html，然后调用 image2html MCP 的 validate_design 工具。

参数：
original_image=F:\code\image2html\examples\login.png
code=读取到的完整 HTML
framework=html
style_framework=inline
component_library=none
typescript=false
threshold=85

不要修改任何文件。请报告 success、passed、similarity、quality 和 regions。
```

项目示例的预期结果：

```text
success = true
passed = true
similarity = 100
```

这一步不需要调用生成模型，适合确认 OpenCode、MCP、图片路径和浏览器是否正常。

## 6. 生成自己的组件

把图片路径和目标文件路径改成你的实际路径，然后在业务项目的 OpenCode 会话中发送：

```text
请调用 image2html 的 generate_component 工具。

image_path=F:\designs\dashboard.png
framework=react
style_framework=tailwind
component_library=antd
typescript=true
responsive=true
pipeline=direct
quality_mode=precision
layout_mode=single
asset_mode=none

拿到完整源码后，请使用编辑工具将 code 写入当前项目的 src\components\Dashboard.tsx。
请分别报告工具是否执行成功、文件是否实际写入、视觉校验是否通过。
```

默认使用 `quality_mode=precision`，校验未通过时最多进行 4 轮视觉修复，并检查文字完整性；生成速度和模型消耗会相应增加。其他框架可按下面修改：

- React：`react + tailwind + antd`
- Vue：`vue + tailwind + element`
- 纯 HTML：`html + inline + none + typescript=false`

注意：`success=true` 只表示工具执行成功，`validation.passed=true` 才表示通过当前视觉质量检查。MCP 返回源码后，还需要 OpenCode 将源码写入业务文件，并运行项目构建。

## 7. 视觉校验未通过时

继续在同一个会话中发送：

```text
请调用 image2html 的 repair_component，使用同一张原始图片和当前完整源码。

framework=react
style_framework=tailwind
component_library=antd
typescript=true
quality_mode=precision

请将最终采用的 code 写回 src\components\Dashboard.tsx，然后运行项目构建。
请报告 validation.passed、similarity 和 repairIterations；如果仍未通过，请如实说明。
```

## 8. 遇到问题怎么办

| 看到的现象 | 直接这样处理 |
| --- | --- |
| 找不到 `opencode` 或 `pnpm` | 执行第 1 节的安装命令，重新打开终端 |
| `image2html failed` 或 `Connection closed` | 重新执行 `pnpm build` 和 `node scripts/verify-mcp.mjs`；确认 OpenCode 直接运行 `node ...\dist\mcp\index.js` |
| 工具提示图片或文件不存在 | 使用 MCP 所在电脑可访问的绝对路径，不要使用相对路径 |
| 请求仍发往 `.internal`，或模型返回 401/403 | 检查 `.env` 的六个变量和密钥，并确认配置中的 `cwd` 是 image2html 安装目录 |
| Chromium 启动失败 | 执行 `pnpm exec playwright install chromium` 后重试 |
| `success=true` 但 `passed=false` | 这不是 MCP 连接故障；按第 7 节修复，并以完整质量结果为准 |
| 对话中有源码，但项目里没有文件 | 明确要求 OpenCode 使用编辑工具写入目标文件，MCP 不会自行写入业务项目 |

## 9. 进阶使用

新手跑通以上流程后，再按需查看：

- [使用及 AI 工具接入指导](usage-and-ai-integration.md)：Codex、其他 OpenCode 配置层级、CLI、Node.js API 和完整故障排查。
- [部署指南](deployment.md)：公司内网多人共享、远程适配器和服务部署。
- [示例设计稿](../examples/README.md)：可用于测试转换与校验流程的现有图片。

到这里，你已经可以完成最常用的流程：**设计稿 → 生成代码 → 视觉校验 → 修复 → 写入业务项目。**
