# 示例设计稿

本目录提供可直接用于测试 image2html 的设计稿。CLI 可以使用相对路径；在 OpenCode 等 MCP 客户端中，请换成图片的绝对路径。

## 现有示例

| 文件 | 页面类型 | 复杂度 |
| --- | --- | --- |
| `login.png` | 登录页 | 低 |
| `content-platform.png` | 内容发布平台 | 中 |
| `dashboard.png` | 管理后台 | 高 |
| `jifen.png` | 移动端积分商城 | 中 |
| `juejin.png` | 内容社区长页面 | 高 |
| `dianya.png` | 项目社区页面 | 高 |

`login.html` 是与 `login.png` 对应的参考源码，专门用于 MCP 自检和视觉校验。

## 先运行 MCP 自检

在项目根目录执行：

```bash
node scripts/verify-mcp.mjs
```

成功时会显示：

```text
Structured validation: similarity=100, passed=true
```

这个检查不调用生成模型，只验证 MCP、浏览器和视觉校验链路。

## 生成代码

HTML：

```bash
node dist/cli.js convert examples/login.png --framework html --style inline --component-library none --output output/html
```

React：

```bash
node dist/cli.js convert examples/dashboard.png --framework react --style tailwind --component-library antd --output output/react
```

Vue：

```bash
node dist/cli.js convert examples/content-platform.png --framework vue --style inline --component-library element --output output/vue
```

默认使用 `precision` 质量模式，最多进行 4 轮视觉修复，并检查文字完整性。需要快速试跑时可显式添加 `--quality fast`。

## 在 OpenCode 中校验登录示例

将下面的路径替换为实际绝对路径：

```text
请读取 F:\code\image2html\examples\login.html，然后调用 image2html 的 validate_design。
original_image=F:\code\image2html\examples\login.png
framework=html
style_framework=inline
component_library=none
typescript=false
threshold=85
```

预期返回 `success=true`、`passed=true`、`similarity=100`。
