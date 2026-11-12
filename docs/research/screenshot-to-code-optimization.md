# screenshot-to-code 研究与 image2html 提速方案

> 研究日期：2026-11-11  
> 研究对象：https://github.com/abi/screenshot-to-code  
> 本地研究版本：`a8139779f7c5ae231b7f2a86fa7f83ddc5f7badc`（2026-10-09）  
> 目标：减少设计稿转代码的总耗时、首个可见结果耗时和 OpenCode 调用失败率。

## 1. 结论

可以借鉴，而且有必要重构当前的生成链路，但不建议整体替换项目或简单复制代码。

最有效的方向是：

1. **默认改为单次多模态模型直接生成代码**，不再先生成庞大的结构 JSON。
2. **流式输出生成中的代码并尽早显示预览**，降低用户感知的等待时间。
3. **视觉校验与首版生成解耦**，先出可用草稿，再异步校验和修复。
4. **修改基于当前文件快照做局部编辑**，不要每次重新生成整个页面。
5. 保留现有结构分析作为复杂页面或失败后的专家模式，而不是所有请求的必经步骤。

当前项目已有 MCP、多用户 HTTP、任务队列、视觉校验和 Docker 部署，这些能力不需要推倒重来。

## 2. 当前项目的主要瓶颈

当前默认链路：

```text
设计稿
  ↓ 第一次模型调用
Qwen VL 输出结构 JSON
  ↓ 第二次模型调用
通用模型输出完整代码
  ↓
Token/组件映射
  ↓
Playwright + Pixelmatch 校验
  ↓
一次性返回结果
```

实测复杂页面出现过：

- 结构 JSON 约 35,000 字符、114 个组件。
- 返回代码约 31,000 字符。
- 完整生成耗时十几分钟。
- 结构 JSON 偶发格式错误导致 OpenCode 调用失败。

因此瓶颈不是 MCP 通信，而是：

- 两次串行大模型调用；
- 中间结构过于冗长；
- 首屏必须等待全部代码和校验完成；
- 修改时容易重新生成整个页面；
- 大输出增加了超时、截断和 JSON 解析失败概率。

## 3. screenshot-to-code 的关键实现

### 3.1 图片直接进入代码生成

`backend/prompts/create/image.py` 将原始截图和选中技术栈直接放入生成请求，要求模型生成与截图一致的页面。

它不需要先构造完整的 UI 组件 JSON，再交给另一个模型翻译为代码。

### 3.2 单个文件状态作为工作区

`backend/agent/state.py` 的 `AgentFileState` 只维护：

- 当前文件路径；
- 当前文件内容。

`backend/agent/tools/runtime.py` 围绕当前文件执行：

- `create_file`
- `edit_file`
- `screenshot_preview`
- 其他素材工具

这种方式比完整的页面结构协议更轻量，适合快速草稿和连续修改。

### 3.3 生成过程中就推送代码

`backend/agent/engine.py` 和 `backend/agent/tools/parsing.py` 会在 `create_file` 工具参数仍在流式到达时，提取已经生成的代码内容并推送 `setCode` 事件。

用户不需要等待整个模型响应完成后才看到页面。

### 3.4 通过 WebSocket 推送状态

`backend/routes/generate_code.py` 使用 WebSocket 发送：

- `assistant`
- `thinking`
- `toolStart`
- `toolResult`
- `setCode`
- `variantComplete`

状态与代码是持续到达的，而不是只有一个最终响应。

### 3.5 基于当前文件快照更新

`backend/prompts/update/from_file_snapshot.py` 将当前文件内容和修改要求一起发送给模型，进行现有文件编辑。

这避免了“修改一个按钮颜色，却重新生成整个页面”的浪费。

### 3.6 截图预览是按需工具

`backend/agent/tools/screenshot_preview.py` 将当前 HTML 渲染为桌面和移动截图，供模型检查。

截图是生成过程中的一个工具，不是所有请求都必须同步执行的固定重步骤。

### 3.7 多变体是并行且非阻塞的

`backend/routes/generate_code.py` 使用 `asyncio.create_task` 和 `asyncio.gather` 并行生成变体，并分别推送完成状态。

这个机制适合用户主动要求多个方案的场景，但**不应作为默认提速手段**，因为多变体会增加总模型消耗。我们的默认模式应保持单变体。

## 4. 推荐的新架构

### 4.1 默认快速路径

```text
设计稿 + 技术栈 + Design Token
             ↓
Qwen VL 直接流式生成代码（一次模型调用）
             ↓
    生成多少就预览多少
             ↓
       首版代码可编辑
             ↓
异步执行视觉校验（不阻塞首版预览）
             ↓
有差异时，仅对当前文件做局部修复
```

Qwen VL 本身支持图像输入，因此可以直接生成代码，不需要把视觉理解结果先序列化成超大 JSON。

### 4.2 专家路径

以下情况才启用结构分析：

- 页面特别复杂，需要按区域规划；
- 必须严格映射企业组件树；
- 快速路径校验失败且无法通过局部修复解决；
- 用户明确要求输出结构 JSON；
- 需要离线审计设计结构。

### 4.3 保留现有能力

| 现有模块 | 处理方式 |
| --- | --- |
| `src/llm/client.ts` | 保留 SSE 客户端，增加生成进度与耗时事件 |
| `src/index.ts` | 增加快速路径，结构分析改为可选 |
| `src/structure-parser.ts` | 专家路径继续使用，保留 JSON 修复 |
| `src/validator/` | 改为可异步执行，支持桌面/移动并行截图 |
| `src/mcp/server.ts` | 默认走快速路径，保留结构分析工具 |
| `src/server/` | 保留任务队列、鉴权、产物隔离，增加进度事件 |
| Docker 部署 | 无需推倒重来 |

## 5. 分阶段实施

### P0：建立性能基线

为每个阶段记录：

- `analysisMs`
- `generationMs`
- `validationMs`
- `repairMs`
- `totalMs`
- `timeToFirstCodeMs`
- 输入/输出 Token
- 图片尺寸及压缩后大小

测试样本至少包括：登录页、积分商城、项目社区长页面。

### P1：单次直接生成

新增直接生成 Prompt，要求：

- 输出完整、可运行的目标代码；
- 使用图片中的原始文字；
- 使用指定技术栈和 Design Token；
- 不输出结构 JSON；
- 不输出 Markdown 解释；
- 不为首版草稿生成过多抽象组件。

默认只调用一次 Qwen VL，现有通用代码模型主要用于修复。

### P2：流式预览与异步校验

HTTP 服务增加进度查询或 SSE：

```text
queued → analyzing → generating → preview_ready → validating → completed
```

`preview_ready` 后即可返回代码和预览地址。校验报告随后补充。

Playwright 的桌面、平板和移动截图可以并行执行，避免串行等待。

### P3：增量修改

新增基于文件快照的更新接口：

```json
{
  "path": "src/pages/Home.tsx",
  "currentContent": "当前代码",
  "request": "只把主按钮改为橙色，保持其他结构不变"
}
```

要求模型输出局部编辑，不重写整个页面。

### P4：复杂页面分段生成

只有快速路径无法处理的长页面才按区域拆分：

- Header
- Hero
- Main
- Sidebar
- Footer

各区域使用统一的文件状态和组件契约，避免每个区域独立生成后无法组合。

## 6. 不建议照搬的部分

- 不默认生成多个变体：总成本和资源消耗更高。
- 不把截图预览变成每个步骤都强制执行的工具。
- 不引入完整 Python/FastAPI 技术栈来替代现有 TypeScript 服务。
- 不把大量工具描述全部塞给模型：会增加上下文和工具选择成本。
- 不继续单纯提高 `maxTokens` 作为长期方案：输出越长，耗时和失败概率越高。

## 7. 验收指标

| 指标 | 目标 |
| --- | --- |
| 默认模型调用次数 | 从 2 次降为 1 次 |
| 首个代码可见时间 | 相比当前明显提前，可流式查看 |
| 简单页面生成 | 不再等待视觉校验后才返回 |
| 修改页面 | 基于当前文件局部修改，不全量重建 |
| 复杂页面失败率 | 不再受结构 JSON 格式错误影响 |
| 多用户服务 | 保留任务隔离、并发限制和产物下载 |

具体提速百分比应通过相同样本、相同模型和相同网络条件下的 A/B 测试确定，不能仅依据架构推算。

## 8. 源码参考

- `backend/prompts/create/image.py`：图片直接生成代码
- `backend/agent/state.py`：当前文件状态
- `backend/agent/engine.py`：流式生成与工具循环
- `backend/agent/tools/parsing.py`：从流式参数中提取代码
- `backend/agent/tools/runtime.py`：文件创建和局部编辑
- `backend/agent/tools/screenshot_preview.py`：按需截图预览
- `backend/prompts/update/from_file_snapshot.py`：基于文件快照更新
- `backend/routes/generate_code.py`：WebSocket、任务并行和状态推送

项目采用 MIT License。若直接复制其实现，需要保留相应版权和许可声明；本方案主要借鉴其架构和工作流。
