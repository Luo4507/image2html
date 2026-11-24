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
- [模型对比测试报告](../examples/compare/README.md)：qwen3.8-27b 与 qwen3.8-max 的生成效果对比。

---

## 8. 本地快速接入（5 步上手）

适合已在本机克隆 image2html 仓库的开发者。与第 1-3 节的远程模式二选一即可。

### 8.1 安装与构建

```powershell
cd F:\code\image2html
pnpm install
pnpm build
```

### 8.2 配置模型密钥

编辑项目根目录 `.env`（不会提交到 Git）：

```dotenv
LLM_VL_BASE_URL=https://你的模型端点/compatible-mode/v1
LLM_VL_API_KEY=你的视觉模型密钥
LLM_VL_MODEL=qwen3.8-max
LLM_BASE_URL=https://你的模型端点/compatible-mode/v1
LLM_API_KEY=你的代码模型密钥
LLM_MODEL=qwen3.8-max
```

### 8.3 在 OpenCode 中注册本地 MCP

编辑 `%USERPROFILE%\.config\opencode\opencode.jsonc`，在 `mcp.servers` 中加入（旧版配置格式则直接放在 `mcp` 下）：

```jsonc
{
  "mcp": {
    "servers": {
      "image2html": {
        "type": "local",
        "command": ["cmd", "/c", "cd /d F:\\code\\image2html && pnpm mcp"],
        "enabled": true
      }
    }
  }
}
```

### 8.4 验证连接

完全重启 OpenCode，然后执行：

```powershell
opencode mcp list
```

看到 `✓ image2html  connected` 即接入成功。如果终端找不到 `opencode`，使用桌面版自带的 `opencode-cli.exe` 完整路径。

### 8.5 发一张图测试

```text
分析 F:\testdata\img2html\电鸭.png 的页面结构。
```

能返回区域划分、组件清单和设计 Token，就说明全链路可用。

### 8.6 本地与远程怎么选

| 维度 | 本地 stdio（本节） | 远程 HTTP（第 1-3 节） |
| --- | --- | --- |
| 图片传递 | 只传本地文件路径，MCP 自己读盘 | 路径或 Base64 上传均可 |
| 部署成本 | 每条命令拉起进程，零额外服务 | 需常驻 `node dist/server/index.js` 或 Docker |
| 适用场景 | 个人本机开发、调试源码 | 团队共用、跨机器调用、集中管理密钥 |
| 工具参数 | `image_path` | `image_path` / `image_base64` + `image_filename` |

---

## 9. 项目中的提示词场景手册

**通用公式**：`给图片 + 给目标（技术栈/目录/规范）+ 给验收标准（写入文件、构建通过、视觉校验）`。

### 9.1 全新功能 / 页面

```text
根据 designs/admin-dashboard.png 在 admin 应用里新增一个「数据看板」页面。
要求：
1. 使用 image2html 生成 React + TypeScript + antd 组件，风格与现有页面一致；
2. 按项目现有目录规范放入 src/admin/views/，并注册路由；
3. 静态数据集中放在单独的数据文件，方便后续替换为 /api/v1 接口；
4. 完成后运行类型检查和构建，通过后预览效果。
```

### 9.2 组件开发

```text
把 designs/login-card.png 做成一个可复用的 LoginCard 组件（React + TS）。
要求 props 可配置标题和提交事件，样式用 Tailwind，文件放 src/components/LoginCard.tsx。
先 analyze_structure 分析结构，再生成并写入文件，最后跑构建。
```

### 9.3 问题修改（视觉偏差修复）

```text
生成的 DianyaPage 与 F:\testdata\img2html\电鸭.png 还有差异，请对比设计稿检查导航高度、
统计数字颜色和卡片内边距，逐项修正后重新渲染对比。
```

也可以用工具级修复：

```text
刚才生成的页面和设计稿不一致（相似度 92%，主要差异在卡片间距和标题字号）。
请用 repair_component 针对这些 diff 区域修复，保持其他部分不变，修完重新校验到 95% 以上。
```

### 9.4 视觉校验（只评估，不改代码）

```text
用 validate_design 检查 generated/Generatedpage.html 与 designs/dashboard.png 的还原度，
给出相似度、差异区域和修改建议，先不要改代码。
```

### 9.5 素材提取

```text
用 extract_assets 把 designs/home.png 里的 Logo、图标和封面图裁出来，
存到 src/assets/home/，并把页面中对应位置替换为真实图片引用。
```

### 9.6 高保真优化（MCP + 裁图 + 精修）

```text
这个页面照片区域不能用 CSS 近似，要求：
1. 先用 image2html 生成整体结构；
2. 把轮播图、封面、头像等照片区域从原图裁切为真实素材；
3. 替换生成代码中的渐变占位，保留原图的角标和文字；
4. 最后对比渲染效果。
```

### 9.7 技术栈切换 / 多版本对比

```text
同一张 designs/dashboard.png，分别生成 Vue3 + Element Plus 和纯 HTML + Tailwind 两个版本，
放到 prototypes/ 下对比，告诉我各自相似度。
```

### 9.8 批量处理

```text
把 designs/ 下所有 png 设计稿批量生成 HTML 页面，输出到 prototypes/batch/。
每张记录相似度和耗时，失败的列出来并说明原因，最后汇总成一张表。
```

### 9.9 结构分析（不写代码）

```text
只分析 designs/complex-page.png 的页面结构：区域划分、组件清单、设计 Token（主色、字号、间距），
不要生成代码。把结果整理成 Markdown 表格。
```

### 9.10 接入真实数据

```text
把刚生成的静态页面改为接口驱动：用 axios 请求 /api/v1/projects，替换 data 里的静态数组，
保留加载和空状态，接口路径走 Vite proxy。
```

### 提示词通用技巧

1. **给绝对路径**：图片路径写全（如 `F:\testdata\img2html\电鸭.png`），避免工具找不到文件。
2. **指定写入位置**：明确「写入到 `src/xxx/`」，否则代码可能只出现在对话里。
3. **要求验收**：加上「跑构建 / 类型检查 / 视觉校验」，让 OpenCode 自己闭环。
4. **分步迭代**：先结构、再生成、后精修，比一次性要求 100% 还原更稳定。
5. **照片型页面**：直接声明「照片区域用原图裁切，不要 CSS 近似」，可显著提高保真度。

### 9.11 素材与样式提取及编写

#### A. 素材提取（extract_assets）

从设计稿中自动识别并裁切 Logo、图标、图片等可复用素材。

- **本地模式**：支持 `output_dir`，裁切结果直接写盘为 PNG 文件。
- **远程模式**：通过 `assets` 返回 `{ name, mimeType, data(base64) }` 数组，由 OpenCode 写入项目目录。

提示词示例：

```text
用 extract_assets 把 designs/home.png 里的 Logo、图标和封面图裁出来，存到 src/assets/home/，
并把页面中对应位置替换为真实图片引用。
```

#### B. 样式提取（analyze_structure → designTokens）

结构分析除了区域和组件，还会输出 **Design Tokens**：

| Token 类别 | 内容示例 |
| --- | --- |
| colors | `primary: '#f5b041'`、`textPrimary: '#262626'`、`background: '#f5f5f5'`、`border: '#d9d9d9'` |
| typography | `h1: 24px/600`、`h2: 20px/600`、`body: 14px/400`、`caption: 12px/400` |
| spacing | `unit: 8`，`scale: [8, 16, 24, 32, 40, 48]` |
| borderRadius | `sm: 4px`、`md: 6-8px`、`lg: 8-12px` |

提示词示例：

```text
只分析 designs/home.png 的设计 Token：主色、文字颜色、字号层级、间距体系、圆角规范，
整理成 Markdown 表格，不要生成代码。
```

#### C. 样式编写（把 Token 落地到项目）

提取的 Token 可以直接转成项目样式配置：

**Tailwind（`tailwind.config.js`）**

```js
export default {
  theme: {
    extend: {
      colors: {
        primary: '#f5b041',
        ink: '#262626',
        sub: '#595959',
        page: '#f5f5f5',
      },
      borderRadius: { sm: '4px', md: '8px', lg: '12px' },
      spacing: { 1: '8px', 2: '16px', 3: '24px', 4: '32px' },
    },
  },
}
```

**antd 主题（`ConfigProvider`）**

```tsx
import { ConfigProvider } from 'antd'

<ConfigProvider
  theme={{
    token: {
      colorPrimary: '#f5b041',
      colorText: '#262626',
      colorTextSecondary: '#595959',
      colorBgLayout: '#f5f5f5',
      borderRadius: 8,
      fontSize: 14,
    },
  }}
>
  <App />
</ConfigProvider>
```

**CSS 变量（任意框架）**

```css
:root {
  --color-primary: #f5b041;
  --color-text: #262626;
  --color-bg: #f5f5f5;
  --radius-md: 8px;
  --space-unit: 8px;
}
```

提示词示例：

```text
分析 designs/home.png 的设计 Token，并把它们写入项目的 tailwind.config.js 和 antd ConfigProvider，
主色、文字色、圆角保持与设计稿一致，改完跑构建确认无报错。
```

---

## 10. 框架与组件库支持情况

### 10.1 支持矩阵（源码约束）

| framework | 可用 component_library | 说明 |
| --- | --- | --- |
| `react` | `antd` / `none` | React 不支持 `element`（会报 `React supports Ant Design (antd) or none`） |
| `vue` | `element` / `none` | Vue 不支持 `antd`（会报 `Vue supports Element Plus (element) or none`） |
| `html` | 仅 `none` | 纯 HTML 不使用组件库，可配 Tailwind / inline 样式 |

参数校验逻辑见 `src/runtime/codegen-options.ts`，传错组合会在生成前直接报错。

### 10.2 React + antd 实测结果

| 测试项 | 结果 |
| --- | --- |
| 设计稿 | `examples/login.png`（欢迎登录卡片） |
| 参数 | `framework=react`、`component_library=antd`、`typescript=true`、`style_framework=tailwind`、`pipeline=direct`、`quality_mode=fast` |
| 输出 | `Generatedpage.tsx`（2,156 字符），`imports: ["react", "antd"]` |
| 视觉相似度 | **98.9%** |
| 耗时 | ~111 秒（真实模型调用，非缓存） |
| 结论 | ✅ **React + antd 链路完整可用**，可直接生成带 Form 校验的 TSX 组件 |

### 10.3 已知注意事项

1. **推荐 `pipeline=direct`**：`structured` 流程在校验运行时可能出现 `antd/dist/reset.css` 解析失败（Rollup 无法解析 antd 样式路径），遇到时改用 `direct` 即可。
2. **复杂页面建议先 `fast` 出稿再精修**：`balanced` 模式生成长 TSX 时偶发 JSX 特殊字符未转义导致 typecheck 失败，`fast` 更稳定；需要更高相似度再用 `precision` 触发自动修复循环。
3. **React 产物是 TSX 组件而非完整应用**：需要自行接入项目的入口、路由与样式体系（第 9 章的提示词已包含「写入项目并跑构建」的约定）。


