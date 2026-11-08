# MCP Server 使用示例

## 1. 启动 MCP Server

```bash
cd design-to-code
pnpm install
pnpm build
pnpm mcp
```

## 2. 在 OpenCode 中配置

编辑 `~/.config/opencode/opencode.json`:

```json
{
  "mcp": {
    "design-to-code": {
      "type": "local",
      "command": ["node", "F:/code/image2html/design-to-code/dist/mcp/index.js"],
      "enabled": true,
      "env": {
        "QWEN_VL_BASE_URL": "http://your-server:8000/v1",
        "GLM_BASE_URL": "http://your-server:8001/v1"
      }
    }
  }
}
```

## 3. 使用示例

### 生成组件

```
用户：@design-to-code 请根据 designs/login.png 生成 React + TypeScript + Ant Design 的登录页面组件

OpenCode：
1. 调用 generate_component 工具
2. Qwen3.5-VL 分析设计稿结构
3. GLM 5.3 生成 React 代码
4. 自动 Token 映射和组件替换
5. 返回生成的代码

输出：
✅ 代码生成成功！

📄 文件名: LoginForm.tsx
🧩 组件: LoginForm
📦 依赖: react, antd

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Button, Input, Card, Form } from 'antd';
...
```

### 校验还原度

```
用户：请校验这段代码与原图的还原度

OpenCode：
1. 调用 validate_design 工具
2. Playwright 渲染代码并截图
3. Pixelmatch 对比原图
4. 返回相似度报告

输出：
📊 相似度: 87.5% (阈值: 85%)
✅ 视觉校验通过
```

### 修复差异

```
用户：请修复 Header 区域的差异

OpenCode：
1. 调用 repair_component 工具
2. AI 分析差异原因
3. 自动修复代码
4. 返回修复后的代码

输出：
✅ 代码修复完成！

修复的差异区域:
  - header: 12.3%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[修复后的代码]
```

### 分析结构

```
用户：请分析 designs/dashboard.png 的结构

OpenCode：
1. 调用 analyze_structure 工具
2. Qwen3.5-VL 分析设计稿
3. 返回 JSON 结构

输出：
✅ 结构分析完成！

📄 页面: Dashboard (dashboard)
📐 布局: grid / row
🧩 组件数: 15
🎨 区域数: 4

{
  "page": { "title": "Dashboard", "type": "dashboard" },
  "regions": [...],
  "components": [...],
  "designTokens": {...}
}
```

## 4. 完整工作流

```
用户：请完成以下任务：
1. 读取 designs/login.png
2. 生成 React 组件
3. 校验还原度，要求 ≥85%
4. 如果未通过，自动修复并重新校验

OpenCode 执行过程：
┌─────────────────────────────────────────┐
│ 1. generate_component                   │
│    输出：LoginForm.tsx                  │
├─────────────────────────────────────────┤
│ 2. validate_design                      │
│    输出：相似度 78%（未通过）           │
├─────────────────────────────────────────┤
│ 3. repair_component                     │
│    输出：修复后的代码                   │
├─────────────────────────────────────────┤
│ 4. validate_design                      │
│    输出：相似度 92%（通过）✅           │
└─────────────────────────────────────────┘
```

## 5. 与 Cursor 集成

编辑 `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "design-to-code": {
      "command": "node",
      "args": ["F:/code/image2html/design-to-code/dist/mcp/index.js"],
      "env": {
        "QWEN_VL_BASE_URL": "http://your-server:8000/v1",
        "GLM_BASE_URL": "http://your-server:8001/v1"
      }
    }
  }
}
```

在 Cursor 中：

```
用户：@design-to-code 请根据 designs/login.png 生成 React 组件

Cursor：调用 MCP Server → 生成代码并插入编辑器
```
