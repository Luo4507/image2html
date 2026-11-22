# React/Vue 可运行生成与视觉校验设计

**日期：** 2026-11-12
**状态：** 已获用户批准
**范围：** 原实施顺序的第 1–4 阶段；资源接入、接口一致性和任务恢复作为后续独立任务。

## 背景与问题

当前 HTML 已具备生成、Playwright 渲染、视觉校验和自动修复闭环。React/Vue 仅通过提示词生成单文件文本，视觉校验器直接将文本交给 `page.setContent()`，无法执行 JSX、TypeScript、Vue SFC 或 package imports。默认配置为 React，但真实图片验证仅覆盖 HTML，导致默认路径与已验证路径不一致。

## 目标

1. React 18 与 Vue 3 生成结果能够在真实 Vite 工程中编译、运行和截图。
2. 三种框架复用现有视觉指标、质量门禁、截图和自动修复流程。
3. 输出可复用的完整 Vite 工程，而不是只输出孤立源码文件。
4. 明确框架、样式方案和组件库的兼容关系，非法组合在模型调用前失败。
5. 建立单元、集成和真实图片端到端验证，防止 HTML 回归。

## 非目标

- 本阶段不实现路由、后端接口、业务状态管理或交互逻辑推断。
- 本阶段不改变现有视觉相似度算法和质量阈值。
- 本阶段不实现分布式队列、资源自动接入或 MCP/HTTP 参数整理。
- 不支持 React 搭配 Element Plus、Vue 搭配 Ant Design、HTML 搭配任何框架组件库。

## 方案比较

### 采用：共享 Vite 工程适配层

框架适配器负责生成工程、编译和启动运行环境。视觉校验器只关心可访问页面。临时校验工程与最终导出工程复用同一个 scaffold，避免两套模板发生偏差。

### 备选：全量工程优先重写

所有输入一开始都作为完整工程处理。结构统一，但需要同时重写生成、产物、MCP、HTTP 和 CLI，回归范围过大。

### 备选：浏览器 CDN 与即时转译

实现较快，但不能可靠验证真实 npm 依赖、TypeScript、Vue SFC 和生产构建，不作为实施方案。

## 总体架构

新增三个边界清晰的模块：

1. **FrameworkProjectScaffolder**：根据代码和 `CodegenOptions` 创建 HTML、React 或 Vue 工程文件。
2. **FrameworkRuntime**：负责选项校验、依赖解析、TypeScript 检查、Vite 构建、启动和关闭服务。
3. **ProjectExporter**：复用 scaffold，将完整工程写入用户指定目录；不复制 `node_modules`、构建缓存或临时截图。

`VisualValidator` 通过框架运行适配器获取页面 URL。HTML 保持现有 `page.setContent()` 路径；React/Vue 使用 Vite 页面 URL。每个校验运行环境在截图结束后关闭，自动修复的下一轮使用最新代码重新构建，避免旧模块缓存。

## 工程模板

### 公共文件

- `package.json`：声明目标框架、样式方案和组件库依赖及构建脚本。
- `vite.config`：使用对应框架插件。
- `index.html` 与 `src/main`：提供稳定入口。
- TypeScript 配置：仅在启用 TypeScript 时执行严格检查。
- 样式配置：本阶段 React/Vue 支持 Tailwind 与 inline。Tailwind 提供 PostCSS/Tailwind 配置，inline 不增加编译器。SCSS 与 CSS Modules 需要伴随样式文件，在单文件模型协议扩展前对 React/Vue 明确拒绝。

### React

- React 18、React DOM 和 Vite React 插件。
- 生成源码必须默认导出页面组件，入口显式挂载到 `#root`。
- TypeScript 使用 `.tsx` 和 `tsc --noEmit`；JavaScript 使用 `.jsx`，不执行 TypeScript 检查。
- `antd` 使用 Ant Design 5；`none` 仅允许 React 与浏览器原生依赖。

### Vue

- Vue 3 和 Vite Vue 插件。
- 生成源码必须是合法 SFC，入口显式创建应用并挂载到 `#root`。
- TypeScript 使用 `<script setup lang="ts">` 和 `vue-tsc --noEmit`；JavaScript 使用普通 `<script setup>`。
- `element` 使用 Element Plus；`none` 仅允许 Vue 与浏览器原生依赖。

### HTML

保留现有渲染行为和资源占用方式，不引入 Vite 运行时成本。

## 生成约束与后处理

直接生成提示词按框架拆分，明确默认导出、SFC 结构、允许的依赖和样式文件约束。模型生成后不再执行通用正则组件替换。

结构化流程保留现有模型分工，但同样经过目标框架的编译和运行检查。`TokenMapper` 只执行不会破坏目标文件语法的映射；样式定义注入改为框架感知处理，不能向 React 文件顶部直接拼接 `<style>`。

`generateFilename()` 同时考虑框架和 `typescript`：React TypeScript 为 `.tsx`，React JavaScript 为 `.jsx`，Vue 为 `.vue`，HTML 为 `.html`。

## 编译与运行错误

- 非法技术栈组合在模型调用前返回明确错误。
- 编译错误包含框架、阶段和精简后的诊断信息，不得静默回退为 HTML。
- 页面加载时收集 `pageerror` 与关键控制台错误；挂载根节点为空时判定运行失败。
- 转换失败保持 `success: false`，不能因返回了模型文本而标记运行成功。
- 自动修复只处理成功编译并可截图的候选版本；编译失败的候选不进入相似度比较。

## 视觉校验集成

`DesignToCode.convert()` 将完整 `CodegenOptions` 传给校验器。现有公开 `validate()` 保持向后兼容，可增加可选目标参数；未提供目标参数时按 HTML 处理。

主视口仍按原图尺寸渲染，桌面、平板和移动截图仍由同一运行页面生成。指标、差异图、区域聚合和质量门禁复用现有实现。Vite 服务、浏览器页面和临时目录在成功与异常路径均释放。

## 工程导出

CLI 增加明确的工程输出能力，Node API 暴露同一 exporter。导出结果包含源码、配置、入口和依赖声明，并附基本运行命令。现有单文件结果字段保留，避免破坏调用方；完整工程作为新增产物提供。

MCP 与 HTTP 的完整工程打包和下载接口不在本阶段扩展，待后续接口一致性任务统一处理。

## 兼容矩阵

| framework | componentLibrary | 状态 |
| --- | --- | --- |
| react | antd / none | 支持 |
| vue | element / none | 支持 |
| html | none | 支持 |
| react | element | 拒绝 |
| vue | antd | 拒绝 |
| html | antd / element | 拒绝 |

React/Vue 本阶段支持 `tailwind`、`inline`；选择 `scss` 或 `css-modules` 时在模型调用前返回明确错误。HTML 保留现有样式选项。`layoutMode: segmented` 继续仅限 HTML，其他框架选择该模式时在模型调用前报错。

## 测试策略

### 单元测试

- 兼容矩阵和非法组合。
- React `.tsx`/`.jsx`、Vue `.vue` 文件名。
- 三种框架 scaffold 的入口、依赖和配置。
- 框架感知 token/style 处理。
- 运行错误诊断和资源清理。

### 集成测试

使用固定、无模型的最小组件完成：

- React TypeScript + Ant Design 编译、Vite 构建、Playwright 截图。
- Vue TypeScript + Element Plus 编译、Vite 构建、Playwright 截图。
- React JavaScript 与 Vue JavaScript 路径。
- React/Vue 的 Tailwind 与 inline 路径，以及 SCSS/CSS Modules 的提前拒绝。
- 非法 JSX、非法 SFC 和运行时挂载失败必须返回错误。
- 现有 HTML 渲染和像素比较保持通过。

### 真实图片回测

使用同一设计稿分别执行：

1. HTML + inline + none，确认原有路径不回归。
2. React + TypeScript + antd，验证生成、构建、截图与视觉结果。
3. Vue + TypeScript + element，验证生成、构建、截图与视觉结果。

记录编译状态、运行错误、相似度、质量门禁、模型调用、耗时和修复次数。视觉质量未过门禁应如实报告，不与“工程可运行”混为一谈。

## 完成标准

- React/Vue 生成结果不再直接进入 `page.setContent()`。
- 两种框架均可通过真实 Vite 构建并由 Playwright 截图。
- 完整工程可导出，且导出工程能够安装依赖并构建。
- 非法组合在模型调用前被拒绝。
- 全部单元/集成测试、TypeScript 检查和项目构建通过。
- 三种框架的真实图片回测均有可审计产物与结果。

## 后续独立任务

按既定顺序继续：生成流程接入提取资源；统一 MCP/HTTP 参数并修复 threshold；实现任务和缓存的持久化恢复。这些任务不复用本设计的完成状态，需分别增加回归测试。
