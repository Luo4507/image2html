# API 参数一致性设计

**日期：** 2026-11-13  
**状态：** 按已批准的第五阶段顺序实施

## 目标

使 Node、CLI、MCP 和 HTTP 对同一生成任务使用一致的框架、样式、组件库、TypeScript、响应式、pipeline、qualityMode、layoutMode 和 assetMode 选项；MCP 校验阈值必须真正影响质量门禁。

## 设计

- MCP `generate_component` 增加 `style_framework`、`pipeline`、`quality_mode`、`layout_mode`、`asset_mode`，映射到同名 Node 选项。
- MCP `validate_design` 增加目标框架选项，并复用 Vite 视觉校验；`threshold` 通过单次校验配置覆盖实际生效。
- HTTP `optionSchema` 接收 `pipeline`、`qualityMode`、`layoutMode`、`assetMode`，合并默认配置后进入现有任务与缓存键。
- CLI 保留已有选项并暴露 pipeline、quality、layout；资源提取沿用 `--extract-assets`。
- 所有入口使用同一兼容性校验。HTTP 对非法技术栈返回 400，不创建模型任务；缺图、限流和队列满仍保持现有语义。
- 本阶段不增加完整工程 ZIP 下载，不改变任务恢复策略。

## 验证

- MCP 单元测试证明所有选项映射正确，threshold 与 React/Vue 目标进入实际 validator 调用。
- HTTP 测试证明新增字段进入转换及缓存，并拒绝非法组合。
- CLI help 和完整测试、类型检查、构建通过；现有 API 调用保持向后兼容。
