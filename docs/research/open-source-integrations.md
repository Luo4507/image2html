# 开源图转页面项目要点分析与集成建议（源码核实版 v2）

> 研究日期：2026-11-20（v2 源码核实修订）
> 核实方式：实际克隆以下仓库当前 master 源码逐文件分析（克隆于 2026-11-20，%TEMP%/i2h-research/）：
> - abi/screenshot-to-code（最新 main，2026-11 演进版）
> - NoviScl/Design2Code（斯坦福 SALT Lab，★606）
> - wandb/openui（最新 main）
> - bernaferrari/FigmaToCode（最新 main）
> - imgcook/imgcook（仅落地页+插件，核心算法未开源，v1 中"部分开源可借鉴布局算法"的表述已修正）
> 前置文档：`screenshot-to-code-optimization.md`（基于 2026-10-09 commit a813977 的分析——**注意：该版本已过时，见 3.1 节重大演进**）、`quality-auto-correction.md`

## 0. v1 修正声明

| v1 论断 | 源码核实结果 | 修正 |
|---|---|---|
| screenshot-to-code 是"单次多模态直接生成 + 提示词规则" | **已演化为多轮工具调用 agent**：create_file/edit_file/screenshot_preview 等工具，system prompt 规定编辑契约 | 见 3.1，借鉴重点从"提示词"变为"agent 化自校验循环" |
| imgcook"部分开源，布局推断算法可借鉴" | github.com/imgcook/imgcook 只有 README 和插件，**布局算法核心代码未开源**（仅有技术文章） | 降级为"思想参考"，无代码可移植 |
| Design2Code "文本规划中间层" | 确认存在且更细：**layout_marker_prompting**（在输入图上画编号标记）与 visual_revision（双图对比修订） | 新增为高价值可集成项（P0-4、P1-4） |
| openui "函数调用式编辑" | 编辑就是常规对话式迭代；评测用 **vision LLM 当评委**（eval/model.py，GPT-4V 看图打 JSON 分） | "LLM-as-judge"作为补充评测手段记录 |

## 1. 结论摘要（v2 更新版，按 ROI 排序）

1. **P0-1 修复循环 agent 化**（借鉴 s2c 的 screenshot_preview 自校验，1~2 天）**【实测暂缓：D/E 两形态均未获益，见 3.6】**：
   把"截图对照"作为工具交给模型——每次补丁后模型主动请求渲染截图、自己对比、决定下一步，替代我们当前的"补丁→整页评分→门槛判断"批处理循环。这是对我们实测平台期（4 轮同补丁 72.12）最直接的解法。
2. **P0-2 布局标记提示**（借鉴 Design2Code layout_marker，半天）**【实测降优先级：不优于 B 且可能诱导局部优化，见 3.6】**：
   生成/修复前在原图上叠加编号标记（#1、#2...），提示词用编号引用元素；修复时按编号下发"修复 #3 的配色"。改动极小、收益直接。
3. **P0-3 结构匹配质量指标**（借鉴 Design2Code metrics/，2~3 天）：
   文字块中心距 + 匈牙利匹配 + CIEDE2000 颜色差，替代/补充像素 edge 指标。注意我们原图无 HTML，文字块用已有 text-extraction（视觉模型）替代他们的 OCR-free 变色检测。
4. **P0-4 双图对比修订 prompt 模板**（借鉴 Design2Code visual_revision_prompting，半天）**【实测确认：72.05→72.74，见 3.6】**：
   修订 prompt 显式携带"参考图 + 当前渲染图 + 完整文字清单"，并要求"只输出修订后的完整文件"。我们的 buildVisualPatchPrompt 目前只有 diff 图 + 建议列表，缺完整文字清单与显式对比指令。
5. **P1 流式与异步校验**（s2c 提速方案已有规划，照 roadmap 执行）。
6. **P0-5 组件库契约负向清单**（新增，已验证）：antd Table pagination.showTotal 必须传函数等"模型常犯的确定性错误"写入 component-library-contract.ts，半天。

## 2. 源码核实要点（按项目）

### 2.1 screenshot-to-code：已演化为"带自校验工具的编码 agent"

**文件**：`backend/agent/tools/screenshot_preview.py`、`backend/prompts/system_prompt.py`、`backend/agent/tools/definitions.py`

关键实现（逐条核实）：
- `screenshot_preview.py:24-32`：工具渲染当前 HTML 的 **desktop + mobile 全页截图**，作为 multimodal parts 返回给模型，注释明确写着 "These previews are for *seeing*, not keeping: the model views them ... to verify its work"——**自校验是一等公民，不是外部循环**。
- `system_prompt.py` "Tooling instructions"：`create_file` 整个 app 只调一次；更新用 `edit_file` 精确字符串替换，**禁止整文件重生成**；"always call screenshot_preview once after create_file or after edit_file ... If you spot visual problems, fix them with edit_file"——**每次编辑后强制看图自纠**。
- "Targeted element edits"：用户在预览里点选元素，把该元素的 **outerHTML 作为 locator** 下发（且明确提示运行态 DOM 与源码可能不同：className/指令/注入 class），模型只改该元素及其渲染逻辑。这正是我们 issue list 想要的"定向修复"交互的机器版。
- `backend/evals/`：评测用 **eval agent（LLM 评委）**，不是像素指标——证实头部项目早已放弃纯像素评价。

**对我们的启示**：我们当前的 `runAutoCorrection` 是"修→整页校验→分数门槛→再修"的**外层批循环**，模型在提交补丁后看不到结果，下一轮拿到的还是同一套 diff，于是重复同一补丁（实测 4 轮 72.12）。s2c 的答案是**把看图的主动权交给模型**：agent 自己决定何时看图、看完自己改。我们的 vite-runtime + VisualValidator 基建完全支撑得起这个工具化改造。

### 2.2 Design2Code：可移植的评测代码 + 两种强提示技术

**仓库**：github.com/NoviScl/Design2Code，`Design2Code/metrics/visual_score.py`、`Design2Code/prompting/gpt4o.py`

评测指标（README.md + visual_score.py 核实）：
- **文字块检测**：参考页用 OCR-free 变色法（改 HTML 里文字颜色→截两张图→差分定位），生成页用 OCR；承认开源 OCR 噪声大。→ 我们两端都没有 HTML 的情况，直接用现有 text-extraction（视觉模型出文字+框）替代，精度大概率优于 OCR。
- **匹配**：`linear_sum_assignment`（匈牙利算法，scipy），代价矩阵 = 文字相似度（字符级 Sørensen-Dice < 0.5 拒配），并有 `adjust_cost_for_context`（consecutive_bonus）利用阅读顺序先验降错配、`find_possible_merge` 枚举相邻块合并解决粒度不齐——这三个函数可直接移植（MIT 许可待确认，算法自实现也不难）。
- **Block-Match**：匹配块总面积 / 全部块总面积（缺失+幻觉双向惩罚）。
- **Position**：`1 - max(|Δx|,|Δy|)`，归一化质心坐标——比 IoU 简单且对粒度差异更稳（v1 中我建议 IoU，此处修正为质心距离）。
- **Color**：CIEDE2000（`visual_score.py:126 color_similarity_ciede2000`，含 Lab 转换，可整函数移植）。
- **CLIP**：文本框 inpainting 后算 CLIP 相似度——需要模型权重，作为可选项。

提示技术（gpt4o.py 核实）：
- `layout_marker_prompting`：在输入图上叠加编号标记再让模型写码——元素↔编号↔代码三向绑定。
- `visual_revision_prompting` + `gpt4o_revision_call`：**参考图与当前渲染图并排喂给模型**（"Reference Webpage:" / "Current Webpage:" 双图结构），prompt 里附**完整文字清单**（"I also provide you all the texts that I want to include"），要求输出修订后的完整文件。温度 0、固定 seed。
- 策略族：direct / text_augmented / layout_marker / visual_revision / interactive，后者在论文中效果最好。

### 2.3 openui：LLM-as-judge 评测

- `backend/openui/eval/model.py`：`EvaluateQualityModel` 用 GPT-4V 同时看 desktop+mobile 截图，JSON 结构化打分（Weave 追踪）。
- 生成链路本身无特殊机制（流式 + 常规对话迭代），价值在评测范式：**vision 模型评委适合 CI 上做"观感排序"回归**（不卡阈值，只比较两个候选谁更好）。

### 2.4 FigmaToCode：IR 层设计参考

- `packages/backend/src/altNodes/oldAltConversion.ts`：SceneNode→AltNode 转换（向量组扁平化为可 SVG 化分组、文字样式段收集、父子指针赋值）；`packages/backend/src/tailwind/builderImpl/tailwindAutoLayout.ts` 等按框架投影。**重要限定**：其布局推断依赖 Figma auto-layout 元数据（输入是结构化数据而非像素），所以它的 flex 推断逻辑不能直接用于像素输入；可借鉴的是 **IR 与 per-framework builder 分离**的架构——与我们 component-mapper/token-mapper 现有分工一致，属于印证而非新方向。

### 2.5 imgcook：核心算法未开源（修正）

- github.com/imgcook/imgcook 仅含 README、sketch 插件等；布局推断/组件识别算法只有公开技术文章描述（绝对坐标→行列聚类→flex），**无源码可移植**。v1 中"P1-1 布局推断后处理层"保留为思想参考，实现需自研，优先级降为 P2。

## 3.6 修复策略 A/B 验证实验（2026-11-20 实测，dashboard 用例）

实验脚本：`scripts/repair-strategies-compare.mjs`（B/C/D/E 四策略，统一输入：原图 + 当前渲染图 + 54 项文字清单 + KNOWN_ISSUES + 当前代码；验证用项目自带 VisualValidator）。

| 策略 | 机制 | 最佳质量分 | vs 基线 72.05 | 结论 |
|---|---|---|---|---|
| A 旧补丁循环（前两日实验） | 外层批循环 + JSON 补丁 | 72.12 | +0.07 | 4 轮重复同一补丁，平台期 |
| **B 双图修订模板（best-of-5）** | Design2Code 式 prompt，整文件重写，temp 0，校验器择优采纳 | **72.74**（edge 14.63→17.24） | **+0.69** | ✅ 确认有效，推荐集成进 `buildVisualRepairPrompt` |
| C B + 布局标记 | 原图 diff 区域画编号圆标 | 72.26 | +0.21 | 不优于 B；且 C 候选常现 edge↑ 但 overall↓（18.58/71.68 vs B 的 17.24/72.74），标记可能诱导模型过度局部优化。**降优先级** |
| D agentic 多轮（JSON 补丁） | 补丁→渲染截图喂回同一对话→继续 | 72.05 | 0 | 补丁应用失败率高 + 多轮上下文退化（第 3 轮输出畸形 JSON） |
| E agentic 多轮（整文件） | 同上但整文件输出，排除补丁干扰 | 72.05 | 0 | 单轮质量 71.97/71.98 低于 B 的 72.44~72.74；**多轮未带来增益** |

关键发现：
1. **单轮修订质量方差大**（71.88~72.74 且偶发编译失败），可靠的增益机制是"多次独立尝试 + 校验器择优"（B 的 best-of-5 命中 2 次采纳），而非多轮上下文累积。我们的 `runAutoCorrection` 本就采用择优采纳，集成 B 模板后即获得该能力。
2. **组件库契约负向清单价值证实**：首轮 C 3/3 死于同一个 antd 类型错误（`showTotal: false` 应为函数），在 KNOWN_ISSUES 加入该规则后 5/5 全部编译通过。应沉淀进 `src/prompts/component-library-contract.ts`。
3. agentic 多轮（s2c 式）在本次最小实现中未获益，可能原因：单轮反馈信号（标量分数 + 区域列表 + 单张渲染图）不足以支撑模型做有效的增量决策；局限性：单一用例、轻量模型（qwen3-vl-plus），结论仅适用于该配置，不否定该方向。

## 3. 优化建议（v2 修订，含落点与工作量）

### P0-1 修复循环 agent 化（1~2 天）⭐ 最高优先
- 内容：给修复阶段增加 `request_preview` 工具语义——补丁应用并编译通过后，把渲染截图（desktop+mobile 全页）作为工具结果返回给**同一个多轮会话**，由模型自己对照原图决定下一轮 edit_file；外层仅保留最大轮数与质量分兜底，不再用"分数不提升就拒绝"硬切断。
- 落点：`src/index.ts repairWithVision`（改为多轮会话循环）、`src/llm/client.ts`（需要支持多轮 messages，当前 generateWithImages 是单轮）、复用 `src/runtime/vite-runtime.ts` 起常驻预览服务避免每轮重建（当前每轮 validate 都重建项目+构建，35s/轮，agent 化后可降到 ~5s/轮）。
- 依据：s2c `screenshot_preview.py` + system prompt 强制自纠；我们实测的平台期数据。
- 风险：多轮 agent 成本高 2~3 倍，需设每任务 token 预算。

### P0-2 布局标记提示（半天）
- 内容：sharp 在输入图上绘制编号圆标（元素来自 structure analysis 或 text-extraction 的框），生成/修复 prompt 用编号引用；修复指令可精确到"把 #3 的激活态改成白底蓝字"。
- 落点：新增 `src/prompts/layout-marker.ts`；`direct-generation.ts`、`buildVisualPatchPrompt` 接入。
- 依据：Design2Code `layout_marker_prompting`（论文中显著优于纯文字描述）。

### P0-3 结构匹配质量指标（2~3 天）
- 内容：移植 Design2Code 三个函数（匈牙利匹配 + 顺序 bonus + 相邻合并），指标 = Block-Match（覆盖率）/ Position（质心距）/ Text（Dice）/ Color（CIEDE2000）。原图文字块用 `text-extraction.ts`（视觉模型）出，生成页文字块用 layout snapshot 中的文本元素。
- 落点：新增 `src/validator/structural-metrics.ts`；`quality-gate.ts` 增加结构 gate（先观测后收紧）。
- 依据：`metrics/visual_score.py`；我们 edge 容差实验证明像素指标已到信息上限。

### P0-4 双图对比修订模板（半天，可与 P0-1 合并）
- 内容：修订 prompt 固定结构 = 指令 + "Reference Webpage:" 原图 + "Current Webpage:" 当前渲染 + 完整文字清单 + "只输出修订后的完整文件"；temperature 0。
- 落点：`src/prompts/direct-generation.ts buildVisualRepairPrompt`。
- 依据：`prompting/gpt4o.py gpt4o_revision_call` / `visual_revision_prompting`。

### P1-5 常驻预览服务（1 天，P0-1 的前置优化）
- 内容：vite-runtime 增加 `watch` 模式驻留（当前每次 validate 重建+构建约 15~20s），供 agent 化后的高频截图。
- 落点：`src/runtime/vite-runtime.ts`。

### P2-6 LLM-as-judge 观感回归（2 天，可选）
- 内容：CI 上对同一组示例比较"新旧两版渲染图"，vision 模型只回答哪个更接近原图，用于回归排序而非绝对分值。
- 依据：openui `eval/model.py`。

### P2-7 布局推断自研（3~5 天，imgcook 思想，无源码可抄）
- 内容：对 text-extraction/structure 的元素坐标做行列聚类，输出 flex/grid 建议，交叉校验视觉模型的结构判断。

## 4. 不建议做（v2  reaffirm）

| 方向 | 源码核实后的理由 |
|---|---|
| pix2code 式端到端 CNN/LSTM | 已验证历史路线；Design2Code 论文也证实 agentic > 端到端 |
| 自训组件识别/布局模型 | 无训练数据基建；LLM+规则当前够用 |
| 直接移植 FigmaToCode 布局逻辑 | 依赖 Figma auto-layout 元数据，像素输入不适用（只借 IR 架构思想） |
| 引入 CLIP 指标作为 gate | 需模型权重、依赖重，且 openui/s2c 都未用其做硬性 gate，只做参考分 |

## 5. 验收指标（v2）

- P0-1：dashboard 用例修复循环内模型**至少调用一次预览截图**；4 轮内不再出现重复补丁；质量分 ≥78 或人工确认主要 issue 被逐项处理。
- P0-2：修复指令可引用编号定位到 layout snapshot 中已存在的元素。
- P0-3：structuralScore 与人工观感排序一致（5 例盲评）；像素 gate 失败但结构 gate 通过的 case 能输出逐项诊断（哪个文字块偏了多远、什么颜色差多少）。
- 回归：103 个既有测试不降级。
