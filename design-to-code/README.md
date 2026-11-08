# @html-video/design-to-code

高保真设计稿转代码工具，支持内网部署，集成 Qwen3.5-VL 和 GLM 5.3 模型。

## 功能特性

- 🖼️ **设计稿解析**：使用 Qwen3.5-VL 识别 UI 结构、组件、样式
- 💻 **代码生成**：使用 GLM 5.3 生成 React/Vue/HTML 代码
- 🎨 **Design Token**：自动提取并映射设计系统变量
- 🧩 **组件库对接**：自动识别并替换为 Ant Design / Element Plus 组件
- ✅ **视觉校验**：自动对比原图与生成页面，确保还原度
- 🔧 **AI 修复**：差异区域自动修复建议

## 安装

```bash
pnpm install
```

## 配置

创建 `.env` 文件：

```env
# 模型配置
QWEN_VL_BASE_URL=http://qwen-vl.internal:8000/v1
QWEN_VL_API_KEY=your-api-key
VISION_MODEL=qwen3.5-vl-72b-instruct

GLM_BASE_URL=http://glm.internal:8001/v1
GLM_API_KEY=your-api-key
CODE_MODEL=glm-5.3

# 校验配置
VISUAL_SIMILARITY_THRESHOLD=85.0
MAX_RETRY_COUNT=3

# 默认选项
DEFAULT_FRAMEWORK=react
DEFAULT_STYLE_FRAMEWORK=tailwind
DEFAULT_COMPONENT_LIBRARY=antd
```

## 使用

### 编程方式

```typescript
import { DesignToCode } from '@html-video/design-to-code';

const d2c = new DesignToCode();

const result = await d2c.convert({
  image: {
    source: './design.png',
    type: 'path',
  },
  options: {
    framework: 'react',
    styleFramework: 'tailwind',
    componentLibrary: 'antd',
    typescript: true,
    responsive: true,
    accessibility: true,
  },
  modelConfig: {
    visionModel: {
      baseUrl: 'http://qwen-vl.internal:8000/v1',
      model: 'qwen3.5-vl-72b-instruct',
      apiKey: 'your-key',
    },
    codeModel: {
      baseUrl: 'http://glm.internal:8001/v1',
      model: 'glm-5.3',
      apiKey: 'your-key',
    },
  },
  validationConfig: {
    threshold: 85.0,
    viewports: {
      desktop: { width: 1440, height: 900 },
      tablet: { width: 768, height: 1024 },
      mobile: { width: 375, height: 812 },
    },
    maxRetryCount: 3,
  },
});

if (result.success) {
  console.log('Generated code:', result.code.code);
  console.log('Validation:', result.validation);
}

await d2c.close();
```

### CLI 方式

```bash
# 转换单个文件
design-to-code convert ./design.png -f react -s tailwind -c antd -o ./output

# 批量转换
design-to-code batch ./designs/ -f react -o ./output

# 跳过校验（更快）
design-to-code convert ./design.png --no-validate
```

## 工作流程

```
设计稿截图 → Qwen3.5-VL 结构解析 → JSON 中间协议
    ↓
GLM 5.3 代码生成 → Token 映射 → 组件映射 → 代码输出
    ↓
Playwright 渲染截图 → 与原图对比 → 相似度评分
    ↓
├─ ≥85% → 通过 → 工程师审核 → 提交代码
└─ <85% → 生成差异报告 → AI 修复建议 → 人工修复
```

## 输出示例

```tsx
import { Button, Input, Card } from 'antd';

interface LoginFormProps {
  onSubmit: (values: { username: string; password: string }) => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSubmit }) => {
  return (
    <Card title="用户登录" className="w-[400px]">
      <Form layout="vertical" onFinish={onSubmit}>
        <Form.Item label="用户名" name="username">
          <Input placeholder="请输入用户名" />
        </Form.Item>
        <Form.Item label="密码" name="password">
          <Input.Password placeholder="请输入密码" />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" block>
            登录
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
};
```

## 视觉校验

校验结果包含：

- **相似度评分**：0-100%，85% 以上通过
- **差异区域**：具体位置、差异百分比、区域类型
- **差异图片**：红色高亮显示差异部分
- **修复建议**：AI 生成的具体修复方向
- **多端截图**：桌面端、平板端、移动端对比

## 设计系统对接

### Design Token 映射

自动将硬编码值映射为 CSS 变量：

| 原始值 | 映射后 |
|--------|--------|
| `#1890ff` | `var(--color-primary)` |
| `#52c41a` | `var(--color-success)` |
| `8px` | `var(--spacing-xs)` |
| `16px` | `var(--spacing-sm)` |
| `24px` | `var(--text-h1)` |

### 组件库映射

自动将原生 HTML 元素替换为组件库组件：

| 原生元素 | Ant Design |
|----------|------------|
| `<button>` | `<Button>` |
| `<input>` | `<Input>` |
| `<select>` | `<Select>` |
| `<div class="card">` | `<Card>` |
| `<form>` | `<Form>` |

## 开发

```bash
# 构建
pnpm build

# 开发模式
pnpm dev

# 类型检查
pnpm typecheck

# 测试
pnpm test
```

## 架构

```
src/
├── types.ts              # 类型定义
├── config.ts             # 配置管理
├── llm/
│   └── client.ts         # 内网模型客户端
├── prompts/
│   ├── structure-analysis.ts  # 结构解析 Prompt
│   └── code-generation.ts     # 代码生成 Prompt
├── validator/
│   └── visual-validator.ts    # 视觉校验器
├── codegen/
│   ├── token-mapper.ts        # Token 映射
│   └── component-mapper.ts    # 组件映射
├── index.ts              # 主入口
└── cli.ts                # CLI 工具
```

## License

MIT
