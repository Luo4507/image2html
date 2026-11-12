# Design-to-Code MCP Server

为 OpenCode、Cursor、VS Code 等 AI 辅助开发工具提供设计稿转代码的 MCP 服务。

## 功能

- **generate_component**: 根据设计稿生成前端组件代码
- **validate_design**: 校验代码与设计稿的视觉还原度
- **repair_component**: AI 自动修复视觉差异
- **analyze_structure**: 分析设计稿结构（JSON）

## 安装

```bash
cd image2html
pnpm install
pnpm build
```

## 配置

### OpenCode

编辑 `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "design-to-code": {
      "type": "local",
      "command": ["node", "/absolute/path/to/image2html/dist/mcp/index.js"],
      "enabled": true,
      "env": {
        "QWEN_VL_BASE_URL": "http://your-qwen-vl-server:8000/v1",
        "QWEN_VL_API_KEY": "your-key",
        "VISION_MODEL": "qwen3.5-vl-72b-instruct",
        "GLM_BASE_URL": "http://your-glm-server:8001/v1",
        "GLM_API_KEY": "your-key",
        "CODE_MODEL": "glm-5.3"
      }
    }
  }
}
```

### Cursor

编辑 `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "design-to-code": {
      "command": "node",
      "args": ["/absolute/path/to/image2html/dist/mcp/index.js"],
      "env": {
        "QWEN_VL_BASE_URL": "http://your-qwen-vl-server:8000/v1",
        "QWEN_VL_API_KEY": "your-key",
        "VISION_MODEL": "qwen3.5-vl-72b-instruct",
        "GLM_BASE_URL": "http://your-glm-server:8001/v1",
        "GLM_API_KEY": "your-key",
        "CODE_MODEL": "glm-5.3"
      }
    }
  }
}
```

## 使用

### 在 OpenCode 中

```bash
opencode

# 查看 MCP 状态
/mcp

# 使用示例
用户：@design-to-code 请根据 designs/login.png 生成 React 组件

OpenCode：调用 generate_component → 生成代码

用户：请校验还原度

OpenCode：调用 validate_design → 输出相似度报告

用户：请修复差异

OpenCode：调用 repair_component → 输出修复后代码
```

### 在 Cursor 中

```
用户：@design-to-code 请根据 designs/dashboard.png 生成 React + Ant Design 组件

Cursor：调用 MCP Server → 生成代码并插入编辑器
```

## 工具说明

### generate_component

生成前端组件代码。

**参数**:
- `image_path` (string): 设计稿图片路径
- `framework` (string): 目标框架 (react/vue/html)
- `component_library` (string): 组件库 (antd/element/none)
- `typescript` (boolean): 是否使用 TypeScript
- `responsive` (boolean): 是否响应式
- `style_framework` (string): tailwind/scss/css-modules/inline
- `pipeline` (string): direct/structured
- `quality_mode` (string): fast/balanced/precision
- `layout_mode` (string): single/segmented
- `asset_mode` (string): none/extract

**返回**: 生成的代码 + 校验结果（可选）

### validate_design

校验视觉还原度。

**参数**:
- `original_image` (string): 原始设计稿路径
- `code` (string): 生成的代码
- `threshold` (number): 相似度阈值（默认 85%，实际影响质量门禁）
- `framework`、`style_framework`、`component_library`、`typescript`: 目标代码选项；React/Vue 使用 Vite 构建后校验

**返回**: 相似度报告 + 差异区域 + 修复建议

### repair_component

AI 修复视觉差异。

**参数**:
- `original_image` (string): 原始设计稿路径
- `code` (string): 当前代码
- `diff_regions` (array): 差异区域列表

**返回**: 修复后的代码

### analyze_structure

分析设计稿结构。

**参数**:
- `image_path` (string): 设计稿图片路径

**返回**: JSON 格式的页面结构

## 开发

```bash
# 构建
pnpm build

# 开发模式
pnpm dev

# 启动 MCP Server（调试用）
node dist/mcp/index.js
```

## 架构

```
MCP Client (OpenCode/Cursor)
    ↓ stdio
MCP Server (src/mcp/server.ts)
    ↓
DesignToCode (src/index.ts)
    ↓
Qwen3.5-VL (结构分析)
GLM 5.3 (代码生成)
Playwright (视觉校验)
Pixelmatch (图像对比)
```
