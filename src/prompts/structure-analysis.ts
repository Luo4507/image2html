/**
 * 结构解析 Prompt（用于 Qwen3.5-VL）
 */

export const STRUCTURE_ANALYSIS_PROMPT = `请分析这张 UI 设计稿截图，以严格的 JSON 格式输出页面结构。

## 输出格式要求

{
  "page": {
    "title": "页面标题",
    "type": "dashboard|form|list|detail|login|other",
    "layout": {
      "type": "flex|grid",
      "direction": "row|column",
      "columns": 12
    }
  },
  "regions": [
    {
      "id": "header",
      "type": "header|sidebar|main|footer|card|table|form",
      "position": { "x": 0, "y": 0, "width": 1440, "height": 64 },
      "style": {
        "background": "#ffffff",
        "borderBottom": "1px solid #e8e8e8"
      },
      "children": []
    }
  ],
  "components": [
    {
      "id": "btn-submit",
      "type": "button|input|select|table|card|nav|avatar|text|image",
      "position": { "x": 100, "y": 200, "width": 120, "height": 40 },
      "props": {
        "text": "提交",
        "type": "primary",
        "size": "middle"
      },
      "style": {
        "background": "#1890ff",
        "color": "#ffffff",
        "borderRadius": "6px"
      }
    }
  ],
  "designTokens": {
    "colors": {
      "primary": "#1890ff",
      "success": "#52c41a",
      "warning": "#faad14",
      "error": "#f5222d",
      "textPrimary": "#262626",
      "textSecondary": "#595959",
      "background": "#f5f5f5"
    },
    "typography": {
      "h1": { "fontSize": "24px", "fontWeight": 600 },
      "h2": { "fontSize": "20px", "fontWeight": 600 },
      "body": { "fontSize": "14px", "fontWeight": 400 },
      "caption": { "fontSize": "12px", "fontWeight": 400 }
    },
    "spacing": {
      "unit": 8,
      "scale": [8, 16, 24, 32, 40, 48]
    },
    "borderRadius": {
      "sm": "4px",
      "md": "8px",
      "lg": "12px"
    }
  }
}

## 分析要求

1. 识别所有可见 UI 元素，包括按钮、输入框、表格、卡片、导航等
2. 准确提取颜色值（使用 hex 格式，如 #1890ff）
3. 推断字体大小和字重（基于常见设计规范）
4. 识别间距规律（基于 8px 网格系统）
5. 判断组件类型（优先识别 Ant Design / Element Plus 风格组件）
6. 注意响应式布局线索（如栅格、弹性布局等）

请直接输出 JSON，不要包含其他解释文字。`;

/**
 * 构建结构解析消息
 */
export function buildStructureAnalysisMessage(imageBase64: string): Array<{
  role: string;
  content: Array<{ type: string; text?: string; image_url?: { url: string } }>;
}> {
  return [
    {
      role: 'user',
      content: [
        { type: 'text', text: STRUCTURE_ANALYSIS_PROMPT },
        {
          type: 'image_url',
          image_url: {
            url: imageBase64.startsWith('data:')
              ? imageBase64
              : `data:image/png;base64,${imageBase64}`,
          },
        },
      ],
    },
  ];
}
