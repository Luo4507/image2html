# image2html 文档导航

当前项目使用 Node.js / TypeScript。第一次使用只需阅读快速上手；其余文档按场景查阅，不必依次通读。

## 使用与部署

| 文档 | 适合场景 |
| --- | --- |
| [OpenCode 快速上手](configuration-and-usage-guide.md) | 配置远程 MCP URL 和个人密钥，在 OpenCode 中生成组件 |
| [完整使用及 AI 工具接入指导](usage-and-ai-integration.md) | CLI、OpenCode V1/V2、Codex、Cursor、本地与远程 MCP、质量配置和故障排查 |
| [多用户服务器部署指南](deployment.md) | 公司内网单实例部署、HTTP API、用户隔离、任务恢复与转换缓存 |
| [MCP 实现说明](../src/mcp/README.md) | 查看本地 MCP 的五个工具及开发入口 |

## 示例与结果

- [示例设计稿](../examples/README.md)：现有图片、源码及测试方式。
- [最终转换结果](../examples/results/summary.md)：整理后的示例输出与实测汇总。

## 研究与早期方案

这些文档用于理解设计取舍，不替代当前使用手册。

- [screenshot-to-code 提速研究](research/screenshot-to-code-optimization.md)：生成链路与性能优化思路。
- [高保真与自动校正方案](research/quality-auto-correction.md)：视觉质量和修复策略研究。
- [开源能力集成研究](research/open-source-integrations.md)：相关开源项目与可复用能力。
- [早期 Python 概念方案](research/initial-python-solution.md)：2026-11-08 的原始设想，已归档，非当前实现。

## 历史设计档案

[历史设计记录](archive/designs/)用于追溯各阶段的设计原因、约束和验收结果。其中的状态、代码片段和文件路径可能已过时，不作为当前操作依据。旧实施计划已从工作区清理，需要时可通过 Git 历史查阅。
