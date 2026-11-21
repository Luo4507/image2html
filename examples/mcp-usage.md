# MCP 使用示例

完整安装和客户端字段说明见[使用及 AI 工具接入指导](../docs/usage-and-ai-integration.md)。

## 1. 构建

```bash
cd image2html
pnpm install
pnpm build
```

本地五工具入口为 `dist/mcp/index.js`，公司内网远程生成入口为 `dist/mcp/remote-index.js`。两者都是 stdio MCP，由 AI 客户端启动。

## 2. 生成组件

```text
请调用 design-to-code 的 generate_component。
图片绝对路径：F:\designs\login.png
参数：framework=react，style_framework=tailwind，component_library=antd，typescript=true，quality_mode=balanced。
拿到 structuredContent.code 后，将完整源码写入当前项目的 src/components/LoginForm.tsx。
```

生成结果的机器可读字段：

```json
{
  "success": true,
  "code": "完整源码",
  "filename": "LoginForm.tsx",
  "imports": ["react", "antd"],
  "components": ["LoginForm"],
  "validation": {
    "passed": false,
    "similarity": 78.2,
    "regions": [],
    "suggestions": []
  }
}
```

`content` 中仍保留原来的文本报告和源码。生成成功不代表视觉校验通过，应继续检查 `validation.passed`。

## 3. 校验还原度

```text
读取 src/components/LoginForm.tsx，并调用 validate_design。
original_image=F:\designs\login.png，framework=react，style_framework=tailwind，component_library=antd，typescript=true。
返回实际 similarity、quality、regions 和 suggestions。
```

`structuredContent.regions` 是对象数组，可以直接用于后续修复。视觉未通过时 `success` 仍为 `true`、`passed` 为 `false`，这不是 MCP 连接错误。

## 4. 修复并重新校验

```text
使用当前完整源码调用 repair_component，并传入与原代码一致的 framework、style_framework、component_library 和 typescript。
quality_mode=precision。读取工具返回的最终 validation 和 qualityHistory，将采用的源码写回业务文件。
不要只根据“修复完成”文本宣称质量通过。
```

工具内部执行：

```text
当前代码
  → 视觉校验
  → 视觉模型生成修复候选
  → 候选重新校验
  → 质量分数提高才采用
  → 通过、不再提升或达到轮次上限时停止
```

旧参数 `diff_regions` 仍可传递，但新流程会重新校验，不依赖调用方手工拼接差异文本。

## 5. 结构分析与资源提取

```text
调用 analyze_structure 分析 F:\designs\dashboard.png。
直接读取 structuredContent.structure，总结页面区域、组件、布局和 Design Token，不生成代码。
```

```text
调用 extract_assets，将 F:\designs\dashboard.png 中可复用的图片提取到 F:\designs\dashboard-assets。
返回 structuredContent.outputDir 和 paths。
```

资源提取会真实写文件；其他生成和修复工具不会自行写回业务项目。

## 6. 公司内网远程生成

用户机器只需配置：

```env
IMAGE2HTML_URL=https://image2html.internal.example
IMAGE2HTML_API_KEY=replace-with-personal-key
```

客户端启动：

```bash
node /absolute/path/to/image2html/dist/mcp/remote-index.js
```

远程适配器只列出 `generate_component`，执行“上传图片 → 轮询集中任务 → 下载源码和精简校验结果”。模型密钥和 Chromium 仅在服务器侧。远程模式不支持 `asset_mode=extract`，其余四个工具仍使用本地入口。

## 7. 错误处理

```json
{
  "success": false,
  "error": {
    "code": "FILE_NOT_FOUND",
    "message": "文件不存在: ..."
  }
}
```

工具执行失败时还会有 `isError: true`。调用方应优先检查 `isError` 和 `structuredContent.error.code`，不要通过文本中的 emoji 猜测执行状态。
