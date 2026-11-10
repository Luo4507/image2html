# 高保真设计稿转代码：内网工程化落地完整方案

> 版本：v1.0  
> 日期：2026-11-08  
> 适用环境：公司内网（无外网依赖）  
> 已部署模型：Qwen3.5-VL、GLM 5.3  

---

## 目录

1. [方案概述](#1-方案概述)
2. [核心架构](#2-核心架构)
3. [技术选型](#3-技术选型)
4. [部署实施](#4-部署实施)
5. [自动校验系统](#5-自动校验系统)
6. [设计系统对接](#6-设计系统对接)
7. [工程化闭环](#7-工程化闭环)
8. [落地路线图](#8-落地路线图)
9. [风险与应对](#9-风险与应对)
10. [附录](#10-附录)

---

## 1. 方案概述

### 1.1 目标

将 UCD 输出的高保真设计稿（PNG/JPG）自动转换为可维护的 React/Vue/HTML 代码，并通过**自动化视觉校验**确保还原度，最终融入现有研发流程，帮助工程师**快速编写页面**。

### 1.2 核心原则

| 原则 | 说明 |
|------|------|
| **内网闭环** | 所有组件内网部署，数据不出公司 |
| **AI 辅助，人工校准** | AI 完成 70-80% 重复工作，工程师聚焦业务逻辑 |
| **设计系统驱动** | 生成代码必须引用 Design Token，禁止写死样式 |
| **质量门禁** | 自动像素级对比，不达标不入库 |
| **渐进落地** | 从简单页面开始，逐步扩大范围 |

### 1.3 预期效果

| 指标 | 目标 |
|------|------|
| 简单页面还原度 | ≥ 90% |
| 复杂页面还原度 | ≥ 75% |
| 工程师效率提升 | 40-60% |
| 生成代码可维护性 | 符合团队 Code Review 标准 |
| 校验自动化率 | 100% |

---

## 2. 核心架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        开发者工作层                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Web 平台   │  │  IDE 插件   │  │      CLI 工具           │  │
│  │ (上传截图)  │  │ (截图生成)  │  │   (批量转换)            │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
└─────────┼────────────────┼─────────────────────┼────────────────┘
          │                │                     │
          └────────────────┴─────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                     应用服务层 (FastAPI)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  图片预处理 │  │  代码生成   │  │      后处理引擎         │  │
│  │  (裁剪/优化)│  │  (AI 调用)  │  │  (Token 映射/组件替换)  │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                     模型服务层 (内网)                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Qwen3.5-VL  │  │  GLM 5.3    │  │    (可选) SDXL          │  │
│  │  (结构理解) │  │  (代码生成) │  │    (占位图生成)         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                     质量保障层                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  视觉回归   │  │  代码审查   │  │      人工校准           │  │
│  │  (像素对比) │  │  (静态检查) │  │    (差异修复)           │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
设计稿截图 → 预处理 → Qwen3.5-VL 结构解析 → JSON 中间协议
    ↓
GLM 5.3 代码生成 → 后处理（Token 映射/组件替换）→ 代码输出
    ↓
Playwright 渲染截图 → 与原图像素对比 → 相似度评分
    ↓
├─ 相似度 ≥ 85% → 自动通过 → 工程师审核 → 提交代码
└─ 相似度 < 85% → 生成差异报告 → 人工修复 → 重新校验
```

---

## 3. 技术选型

### 3.1 核心工具

| 组件 | 选型 | 版本 | 说明 |
|------|------|------|------|
| 基础框架 | **screenshot-to-code** | latest | 81K+ Stars，MIT 协议，可内网部署 |
| 视觉模型 | **Qwen3.5-VL** | 已部署 | 截图结构理解、UI 元素识别 |
| 代码模型 | **GLM 5.3** | 已部署 | 代码生成、逻辑补全 |
| 渲染引擎 | **Playwright** | 1.40+ | 无头浏览器，生成页面截图 |
| 图像对比 | **Pixelmatch** | 5.3+ | 像素级差异计算 |
| 后端框架 | **FastAPI** | 0.109+ | 高性能 Python API |
| 前端框架 | **React + Vite** | 18+ | screenshot-to-code 原生 |

### 3.2 模型能力匹配

| 任务 | 使用模型 | 原因 |
|------|---------|------|
| 截图结构理解 | Qwen3.5-VL | 多模态理解能力强，中文 UI 识别准确 |
| 布局 JSON 生成 | Qwen3.5-VL | 结构化输出稳定 |
| 代码生成 | GLM 5.3 | 代码能力强，支持长上下文 |
| 代码优化/重构 | GLM 5.3 | 理解业务逻辑，生成可维护代码 |
| 差异分析 | Qwen3.5-VL | 理解视觉差异，给出修复建议 |

### 3.3 硬件要求

| 场景 | GPU | 显存 | 内存 | 存储 |
|------|-----|------|------|------|
| 开发测试 | RTX 4090 × 1 | 24GB | 64GB | 500GB SSD |
| 小团队生产 | A100 × 1 | 40GB | 128GB | 1TB SSD |
| 大团队生产 | A100 × 2 | 80GB | 256GB | 2TB SSD |

> 注：Qwen3.5-VL 和 GLM 5.3 已部署，本方案主要新增 Playwright 渲染节点（CPU 即可）。

---

## 4. 部署实施

### 4.1 环境准备

```bash
# 1. 克隆项目
git clone https://github.com/abi/screenshot-to-code.git
cd screenshot-to-code

# 2. 后端依赖
cd backend
poetry install

# 3. 前端依赖
cd ../frontend
yarn install

# 4. 安装 Playwright（用于视觉校验）
cd ../backend
poetry add playwright pixelmatch pillow
playwright install chromium
```

### 4.2 内网模型对接配置

#### 4.2.1 修改模型配置

```python
# backend/config.py
from pydantic import BaseSettings

class Settings(BaseSettings):
    # 内网模型端点
    QWEN_VL_BASE_URL: str = "http://qwen-vl.internal:8000/v1"
    GLM_BASE_URL: str = "http://glm.internal:8001/v1"
    
    # 模型名称映射
    VISION_MODEL: str = "qwen3.5-vl-72b-instruct"
    CODE_MODEL: str = "glm-5.3"
    
    # 校验配置
    VISUAL_SIMILARITY_THRESHOLD: float = 85.0  # 相似度阈值
    MAX_RETRY_COUNT: int = 3  # 最大重试次数
    
    class Config:
        env_file = ".env"
```

#### 4.2.2 模型调用封装

```python
# backend/llm/internal_client.py
import aiohttp
from typing import AsyncGenerator, Dict, Any

class InternalLLMClient:
    """内网大模型统一客户端"""
    
    def __init__(self, base_url: str, model: str):
        self.base_url = base_url
        self.model = model
        self.api_key = "internal-key"  # 内网认证
    
    async def chat_completion(
        self, 
        messages: list, 
        stream: bool = False,
        **kwargs
    ) -> Dict[str, Any] | AsyncGenerator:
        """调用内网模型"""
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": stream,
            "temperature": kwargs.get("temperature", 0.7),
            "max_tokens": kwargs.get("max_tokens", 4096),
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json=payload
            ) as response:
                if stream:
                    return self._handle_stream(response)
                else:
                    return await response.json()
    
    async def _handle_stream(self, response):
        """处理流式响应"""
        async for line in response.content:
            if line:
                yield line

# 初始化客户端
vision_client = InternalLLMClient(
    base_url=settings.QWEN_VL_BASE_URL,
    model=settings.VISION_MODEL
)

code_client = InternalLLMClient(
    base_url=settings.GLM_BASE_URL,
    model=settings.CODE_MODEL
)
```

### 4.3 核心 Prompt 工程

#### 4.3.1 结构解析 Prompt（Qwen3.5-VL）

```python
# backend/prompts/structure_analysis.py
STRUCTURE_ANALYSIS_PROMPT = """
请分析这张 UI 设计稿截图，以严格的 JSON 格式输出页面结构。

## 输出格式要求

{
  "page": {
    "title": "页面标题",
    "type": "dashboard|form|list|detail|login",
    "layout": {
      "type": "flex|grid",
      "direction": "row|column",
      "columns": 12
    }
  },
  "regions": [
    {
      "id": "header",
      "type": "Header|Sidebar|Main|Footer|Card|Table|Form",
      "position": { "x": 0, "y": 0, "width": 1440, "height": 64 },
      "style": {
        "background": "#ffffff",
        "borderBottom": "1px solid #e8e8e8"
      },
      "children": [...]
    }
  ],
  "components": [
    {
      "id": "btn-submit",
      "type": "Button|Input|Select|Table|Card|Nav|Avatar",
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
2. 准确提取颜色值（使用 hex 格式）
3. 推断字体大小和字重
4. 识别间距规律（基于 8px 网格）
5. 判断组件类型（优先识别 Ant Design / Element Plus 风格组件）
6. 注意响应式布局线索

请直接输出 JSON，不要包含其他解释文字。
"""
```

#### 4.3.2 代码生成 Prompt（GLM 5.3）

```python
# backend/prompts/code_generation.py
CODE_GENERATION_PROMPT = """
请根据以下页面结构 JSON，生成 {framework} 代码。

## 页面结构
{structure_json}

## 设计要求

### 1. 技术栈
- 框架：{framework} (React 18+ / Vue 3+ / HTML5)
- 样式：{style_framework} (Tailwind CSS / SCSS / CSS Modules)
- 语言：TypeScript

### 2. Design Token 使用（强制）
必须使用以下 CSS 变量，禁止写死颜色值和像素值：

:root {
  /* Colors */
  --color-primary: {primary_color};
  --color-success: {success_color};
  --color-warning: {warning_color};
  --color-error: {error_color};
  --color-text-primary: {text_primary};
  --color-text-secondary: {text_secondary};
  --color-background: {background_color};
  
  /* Typography */
  --text-h1: {h1_size};
  --text-h2: {h2_size};
  --text-body: {body_size};
  
  /* Spacing */
  --spacing-xs: 8px;
  --spacing-sm: 16px;
  --spacing-md: 24px;
  --spacing-lg: 32px;
  
  /* Border Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
}

### 3. 组件化要求
- 将页面拆分为语义化组件：Header、Sidebar、Card、Table、Form 等
- 每个组件独立文件，使用 TypeScript 接口定义 Props
- 优先使用 {component_library} 组件库（如 Ant Design / Element Plus）

### 4. 代码规范
- 使用函数式组件 + Hooks（React）或 Composition API（Vue）
- 添加必要的 TypeScript 类型定义
- 关键元素添加 data-testid 属性
- 确保可访问性（ARIA 标签、键盘导航）

### 5. 响应式要求
- 桌面端：1440px 基准
- 平板端：768px 适配
- 移动端：375px 适配

请生成完整、可运行的代码，包含必要的导入语句。
"""
```

### 4.4 Docker Compose 内网部署

```yaml
# docker-compose.internal.yml
version: '3.8'

services:
  frontend:
    build: 
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "5173:5173"
    environment:
      - VITE_BACKEND_URL=http://backend:7001
    depends_on:
      - backend
    networks:
      - internal

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "7001:7001"
    environment:
      - QWEN_VL_BASE_URL=http://qwen-vl.internal:8000/v1
      - GLM_BASE_URL=http://glm.internal:8001/v1
      - VISION_MODEL=qwen3.5-vl-72b-instruct
      - CODE_MODEL=glm-5.3
      - VISUAL_SIMILARITY_THRESHOLD=85.0
    volumes:
      - ./backend:/app
      - ./uploaded_assets:/app/uploaded_assets
      - ./generated_code:/app/generated_code
      - ./visual_reports:/app/visual_reports
    depends_on:
      - playwright
    networks:
      - internal

  playwright:
    image: mcr.microsoft.com/playwright/python:v1.40.0-jammy
    command: >
      python -c "
      from playwright.sync_api import sync_playwright;
      import time;
      print('Playwright ready');
      time.sleep(3600)
      "
    volumes:
      - ./visual_reports:/reports
    networks:
      - internal

networks:
  internal:
    driver: bridge
```

---

## 5. 自动校验系统

### 5.1 校验流程架构

```
┌─────────────────────────────────────────────────────────────┐
│                     校验触发                                 │
│  代码生成完成 / 人工修改后 / CI 流水线触发                   │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   渲染引擎 (Playwright)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  桌面端截图 │  │  平板端截图 │  │    移动端截图       │  │
│  │  1440×900   │  │  768×1024   │  │    375×812          │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   图像对比引擎                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  像素级对比 │  │  区域对比   │  │    结构对比         │  │
│  │ (Pixelmatch)│  │ (SSIM)      │  │    (布局分析)       │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   校验结果处理                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  ≥85% 通过  │  │  70-85% 警告│  │    <70% 失败        │  │
│  │  自动入库   │  │  人工审核   │  │    生成修复建议     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 核心校验代码

```python
# backend/evals/visual_validator.py
import asyncio
from playwright.async_api import async_playwright
from pixelmatch.contrib.PIL import pixelmatch
from PIL import Image, ImageDraw
import io
import base64
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass

@dataclass
class ValidationResult:
    """校验结果"""
    similarity: float  # 相似度 0-100
    passed: bool  # 是否通过
    diff_image: Optional[str]  # 差异图片 base64
    regions: List[Dict]  # 差异区域列表
    suggestions: List[str]  # 修复建议
    screenshots: Dict[str, str]  # 各端截图 base64

class VisualValidator:
    """视觉校验器"""
    
    VIEWPORTS = {
        "desktop": {"width": 1440, "height": 900},
        "tablet": {"width": 768, "height": 1024},
        "mobile": {"width": 375, "height": 812},
    }
    
    def __init__(self, threshold: float = 85.0):
        self.threshold = threshold
    
    async def validate(
        self,
        original_image_path: str,
        generated_html: str,
        viewport: str = "desktop"
    ) -> ValidationResult:
        """
        执行视觉校验
        
        Args:
            original_image_path: 原始设计稿路径
            generated_html: 生成的 HTML 代码
            viewport: 视口类型
        
        Returns:
            ValidationResult: 校验结果
        """
        # 1. 渲染生成的 HTML
        screenshot = await self._render_html(
            generated_html, 
            self.VIEWPORTS[viewport]
        )
        
        # 2. 加载原图和截图
        img_original = Image.open(original_image_path).convert('RGB')
        img_generated = Image.open(io.BytesIO(screenshot)).convert('RGB')
        
        # 3. 统一尺寸
        img_generated = img_generated.resize(
            img_original.size, 
            Image.Resampling.LANCZOS
        )
        
        # 4. 计算像素差异
        diff = pixelmatch(
            img_original, 
            img_generated, 
            threshold=0.1,
            includeAA=False
        )
        
        total_pixels = img_original.size[0] * img_original.size[1]
        similarity = (1 - diff / total_pixels) * 100
        
        # 5. 生成差异图片
        diff_image = self._generate_diff_image(
            img_original, 
            img_generated
        )
        
        # 6. 分析差异区域
        regions = self._analyze_diff_regions(
            img_original, 
            img_generated
        )
        
        # 7. 生成修复建议
        suggestions = await self._generate_suggestions(
            similarity, 
            regions
        )
        
        # 8. 多端截图
        screenshots = await self._capture_all_viewports(generated_html)
        
        return ValidationResult(
            similarity=round(similarity, 2),
            passed=similarity >= self.threshold,
            diff_image=diff_image,
            regions=regions,
            suggestions=suggestions,
            screenshots=screenshots
        )
    
    async def _render_html(
        self, 
        html: str, 
        viewport: Dict
    ) -> bytes:
        """使用 Playwright 渲染 HTML 并截图"""
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page(viewport=viewport)
            
            # 设置内容
            await page.set_content(html, wait_until="networkidle")
            
            # 等待字体加载
            await page.evaluate("document.fonts.ready")
            await page.wait_for_timeout(500)
            
            # 截图
            screenshot = await page.screenshot(
                full_page=True,
                type="png"
            )
            
            await browser.close()
            return screenshot
    
    def _generate_diff_image(
        self, 
        img1: Image.Image, 
        img2: Image.Image
    ) -> str:
        """生成差异对比图片"""
        # 创建差异图片（红色高亮差异区域）
        diff = Image.new('RGB', img1.size, (255, 255, 255))
        draw = ImageDraw.Draw(diff)
        
        # 使用 pixelmatch 生成差异掩码
        from pixelmatch.contrib.PIL import pixelmatch
        diff_array = pixelmatch(img1, img2, threshold=0.1, diff_mask=True)
        
        # 转换为 base64
        buffer = io.BytesIO()
        diff.save(buffer, format='PNG')
        return base64.b64encode(buffer.getvalue()).decode()
    
    def _analyze_diff_regions(
        self, 
        img1: Image.Image, 
        img2: Image.Image
    ) -> List[Dict]:
        """分析差异区域，返回差异位置信息"""
        regions = []
        
        # 将图片分割为网格，逐区域对比
        grid_size = 100
        width, height = img1.size
        
        for y in range(0, height, grid_size):
            for x in range(0, width, grid_size):
                box = (x, y, min(x+grid_size, width), min(y+grid_size, height))
                region1 = img1.crop(box)
                region2 = img2.crop(box)
                
                diff = pixelmatch(region1, region2, threshold=0.1)
                region_pixels = (box[2]-box[0]) * (box[3]-box[1])
                
                if diff / region_pixels > 0.1:  # 差异超过 10%
                    regions.append({
                        "x": x,
                        "y": y,
                        "width": box[2]-box[0],
                        "height": box[3]-box[1],
                        "diff_percentage": round(diff/region_pixels*100, 2),
                        "type": self._classify_region_type(x, y, width, height)
                    })
        
        return regions
    
    def _classify_region_type(
        self, 
        x: int, 
        y: int, 
        width: int, 
        height: int
    ) -> str:
        """分类差异区域类型"""
        # 根据位置推断区域类型
        if y < height * 0.1:
            return "header"
        elif y > height * 0.9:
            return "footer"
        elif x < width * 0.2:
            return "sidebar"
        else:
            return "main"
    
    async def _generate_suggestions(
        self, 
        similarity: float, 
        regions: List[Dict]
    ) -> List[str]:
        """使用 Qwen3.5-VL 生成修复建议"""
        if similarity >= self.threshold:
            return ["校验通过，无需修改"]
        
        # 构建差异描述
        diff_description = f"整体相似度: {similarity}%\n"
        for region in regions:
            diff_description += f"- {region['type']} 区域差异 {region['diff_percentage']}%\n"
        
        # 调用 VL 模型生成建议
        prompt = f"""
        页面视觉校验发现以下差异：
        {diff_description}
        
        请分析可能的原因，并给出具体的修复建议（CSS 调整方向）。
        格式：简洁的 bullet points
        """
        
        # 这里调用 Qwen3.5-VL
        # suggestions = await vision_client.chat_completion(...)
        
        # 示例返回
        return [
            "检查 Header 区域高度是否一致",
            "验证主内容区 padding 是否符合设计稿",
            "确认字体大小和字重是否匹配",
            "检查颜色值是否使用了 Design Token"
        ]
    
    async def _capture_all_viewports(
        self, 
        html: str
    ) -> Dict[str, str]:
        """捕获所有视口的截图"""
        screenshots = {}
        
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            
            for name, viewport in self.VIEWPORTS.items():
                page = await browser.new_page(viewport=viewport)
                await page.set_content(html, wait_until="networkidle")
                await page.wait_for_timeout(500)
                
                screenshot = await page.screenshot(full_page=True)
                screenshots[name] = base64.b64encode(screenshot).decode()
                
                await page.close()
            
            await browser.close()
        
        return screenshots
```

### 5.3 校验 API 接口

```python
# backend/routes/validation.py
from fastapi import APIRouter, UploadFile, File
from backend.evals.visual_validator import VisualValidator, ValidationResult

router = APIRouter()
validator = VisualValidator(threshold=85.0)

@router.post("/validate")
async def validate_design(
    original_image: UploadFile = File(...),
    generated_html: str = Form(...),
    viewport: str = Form("desktop")
) -> ValidationResult:
    """
    校验生成代码与设计稿的还原度
    
    - **original_image**: 原始设计稿图片
    - **generated_html**: 生成的 HTML 代码
    - **viewport**: 校验视口 (desktop/tablet/mobile)
    
    Returns:
        - similarity: 相似度分数 (0-100)
        - passed: 是否通过 (≥85%)
        - diff_image: 差异对比图 (base64)
        - regions: 差异区域列表
        - suggestions: 修复建议
        - screenshots: 多端截图
    """
    # 保存原图
    image_path = f"./uploaded_assets/{original_image.filename}"
    with open(image_path, "wb") as f:
        f.write(await original_image.read())
    
    # 执行校验
    result = await validator.validate(
        original_image_path=image_path,
        generated_html=generated_html,
        viewport=viewport
    )
    
    # 保存校验报告
    report_path = f"./visual_reports/{timestamp}_report.json"
    save_report(result, report_path)
    
    return result

@router.get("/report/{report_id}")
async def get_validation_report(report_id: str):
    """获取校验报告"""
    report_path = f"./visual_reports/{report_id}.json"
    return load_report(report_path)
```

### 5.4 前端校验结果展示

```tsx
// frontend/src/components/ValidationPanel.tsx
import React from 'react';
import { ValidationResult } from '../types';

interface Props {
  result: ValidationResult;
  originalImage: string;
}

export const ValidationPanel: React.FC<Props> = ({ 
  result, 
  originalImage 
}) => {
  const getStatusColor = (similarity: number) => {
    if (similarity >= 85) return 'text-green-600';
    if (similarity >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="validation-panel p-6 bg-white rounded-lg shadow">
      {/* 相似度评分 */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">视觉校验结果</h3>
        <div className={`text-4xl font-bold ${getStatusColor(result.similarity)}`}>
          {result.similarity}%
        </div>
        <div className="text-sm text-gray-500 mt-1">
          {result.passed ? '✅ 校验通过' : '❌ 需要人工修复'}
        </div>
      </div>

      {/* 对比视图 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div>
          <h4 className="text-sm font-medium mb-2">原始设计稿</h4>
          <img 
            src={originalImage} 
            alt="Original" 
            className="w-full border rounded"
          />
        </div>
        <div>
          <h4 className="text-sm font-medium mb-2">生成页面</h4>
          <img 
            src={`data:image/png;base64,${result.screenshots.desktop}`}
            alt="Generated" 
            className="w-full border rounded"
          />
        </div>
        <div>
          <h4 className="text-sm font-medium mb-2">差异高亮</h4>
          <img 
            src={`data:image/png;base64,${result.diff_image}`}
            alt="Diff" 
            className="w-full border rounded"
          />
        </div>
      </div>

      {/* 差异区域列表 */}
      {result.regions.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-medium mb-2">差异区域</h4>
          <div className="space-y-2">
            {result.regions.map((region, index) => (
              <div 
                key={index}
                className="flex items-center justify-between p-3 bg-red-50 rounded"
              >
                <span className="text-sm">
                  {region.type} 区域 
                  ({region.x}, {region.y})
                </span>
                <span className="text-sm font-medium text-red-600">
                  差异 {region.diff_percentage}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 修复建议 */}
      <div>
        <h4 className="text-sm font-medium mb-2">修复建议</h4>
        <ul className="list-disc list-inside space-y-1">
          {result.suggestions.map((suggestion, index) => (
            <li key={index} className="text-sm text-gray-700">
              {suggestion}
            </li>
          ))}
        </ul>
      </div>

      {/* 操作按钮 */}
      <div className="mt-6 flex gap-3">
        <button 
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          onClick={() => window.open(`/report/${result.id}`, '_blank')}
        >
          查看完整报告
        </button>
        <button 
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          onClick={() => downloadCode(result)}
        >
          下载代码
        </button>
        {!result.passed && (
          <button 
            className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
            onClick={() => requestAIRepair(result)}
          >
            AI 自动修复
          </button>
        )}
      </div>
    </div>
  );
};
```

---

## 6. 设计系统对接

### 6.1 Design Token 定义

```typescript
// shared/design-tokens.ts
export const designTokens = {
  colors: {
    primary: '#1890ff',
    success: '#52c41a',
    warning: '#faad14',
    error: '#f5222d',
    text: {
      primary: '#262626',
      secondary: '#595959',
      disabled: '#bfbfbf',
    },
    background: {
      page: '#f5f5f5',
      card: '#ffffff',
      hover: '#fafafa',
    },
    border: '#d9d9d9',
  },
  
  typography: {
    h1: { fontSize: '24px', fontWeight: 600, lineHeight: 1.4 },
    h2: { fontSize: '20px', fontWeight: 600, lineHeight: 1.4 },
    h3: { fontSize: '16px', fontWeight: 600, lineHeight: 1.5 },
    body: { fontSize: '14px', fontWeight: 400, lineHeight: 1.6 },
    caption: { fontSize: '12px', fontWeight: 400, lineHeight: 1.5 },
  },
  
  spacing: {
    xs: '8px',
    sm: '16px',
    md: '24px',
    lg: '32px',
    xl: '48px',
  },
  
  borderRadius: {
    sm: '4px',
    md: '8px',
    lg: '12px',
    full: '9999px',
  },
  
  shadows: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px rgba(0, 0, 0, 0.07)',
    lg: '0 10px 15px rgba(0, 0, 0, 0.1)',
  },
};

// CSS 变量生成
export const generateCSSVariables = () => {
  return `
    :root {
      /* Colors */
      --color-primary: ${designTokens.colors.primary};
      --color-success: ${designTokens.colors.success};
      --color-warning: ${designTokens.colors.warning};
      --color-error: ${designTokens.colors.error};
      --color-text-primary: ${designTokens.colors.text.primary};
      --color-text-secondary: ${designTokens.colors.text.secondary};
      --color-background: ${designTokens.colors.background.page};
      --color-border: ${designTokens.colors.border};
      
      /* Typography */
      --text-h1: ${designTokens.typography.h1.fontSize};
      --text-h2: ${designTokens.typography.h2.fontSize};
      --text-body: ${designTokens.typography.body.fontSize};
      
      /* Spacing */
      --spacing-xs: ${designTokens.spacing.xs};
      --spacing-sm: ${designTokens.spacing.sm};
      --spacing-md: ${designTokens.spacing.md};
      --spacing-lg: ${designTokens.spacing.lg};
      
      /* Border Radius */
      --radius-sm: ${designTokens.borderRadius.sm};
      --radius-md: ${designTokens.borderRadius.md};
      --radius-lg: ${designTokens.borderRadius.lg};
    }
  `;
};
```

### 6.2 代码后处理：Token 映射

```python
# backend/codegen/token_mapper.py
import re
from typing import Dict, List

class TokenMapper:
    """将生成的代码中的硬编码值映射为 Design Token"""
    
    def __init__(self):
        self.color_map = {
            '#1890ff': 'var(--color-primary)',
            '#52c41a': 'var(--color-success)',
            '#faad14': 'var(--color-warning)',
            '#f5222d': 'var(--color-error)',
            '#262626': 'var(--color-text-primary)',
            '#595959': 'var(--color-text-secondary)',
            '#f5f5f5': 'var(--color-background)',
            '#d9d9d9': 'var(--color-border)',
        }
        
        self.spacing_map = {
            '8px': 'var(--spacing-xs)',
            '16px': 'var(--spacing-sm)',
            '24px': 'var(--spacing-md)',
            '32px': 'var(--spacing-lg)',
        }
        
        self.font_size_map = {
            '24px': 'var(--text-h1)',
            '20px': 'var(--text-h2)',
            '14px': 'var(--text-body)',
        }
    
    def map_code(self, code: str) -> str:
        """执行 Token 映射"""
        # 1. 映射颜色
        for hex_value, token in self.color_map.items():
            code = self._replace_color(code, hex_value, token)
        
        # 2. 映射间距
        for px_value, token in self.spacing_map.items():
            code = self._replace_spacing(code, px_value, token)
        
        # 3. 映射字体大小
        for px_value, token in self.font_size_map.items():
            code = self._replace_font_size(code, px_value, token)
        
        # 4. 添加 CSS 变量导入
        code = self._add_token_import(code)
        
        return code
    
    def _replace_color(self, code: str, hex_value: str, token: str) -> str:
        """替换颜色值"""
        # 匹配 Tailwind 类: bg-[#1890ff], text-[#262626]
        pattern = rf'(\w+)-\[{re.escape(hex_value)}\]'
        replacement = rf'\1-[{token}]'
        code = re.sub(pattern, replacement, code, flags=re.IGNORECASE)
        
        # 匹配内联样式: background: #1890ff
        pattern = rf'(background|color|border-color):\s*{re.escape(hex_value)}'
        replacement = rf'\1: {token}'
        code = re.sub(pattern, replacement, code, flags=re.IGNORECASE)
        
        return code
    
    def _replace_spacing(self, code: str, px_value: str, token: str) -> str:
        """替换间距值"""
        # 匹配 Tailwind 类: p-[8px], m-[16px]
        pattern = rf'([pm][xytrbl]?)-\[{re.escape(px_value)}\]'
        replacement = rf'\1-[{token}]'
        code = re.sub(pattern, replacement, code)
        
        return code
    
    def _replace_font_size(self, code: str, px_value: str, token: str) -> str:
        """替换字体大小"""
        pattern = rf'text-\[{re.escape(px_value)}\]'
        replacement = rf'text-[{token}]'
        code = re.sub(pattern, replacement, code)
        
        return code
    
    def _add_token_import(self, code: str) -> str:
        """添加 Token 导入语句"""
        import_statement = "import { generateCSSVariables } from '@/shared/design-tokens';\n"
        
        # 在文件开头添加导入
        if 'import' in code:
            # 在最后一个 import 后添加
            lines = code.split('\n')
            last_import_idx = max(i for i, line in enumerate(lines) if line.startswith('import'))
            lines.insert(last_import_idx + 1, import_statement)
            code = '\n'.join(lines)
        else:
            code = import_statement + code
        
        return code
```

### 6.3 组件库映射

```python
# backend/codegen/component_mapper.py
import re
from typing import Dict, Callable

class ComponentMapper:
    """将原生 HTML 元素映射为设计系统组件"""
    
    def __init__(self, component_library: str = "antd"):
        self.library = component_library
        self.mappers: Dict[str, Callable] = {
            'button': self._map_button,
            'input': self._map_input,
            'select': self._map_select,
            'table': self._map_table,
            'card': self._map_card,
            'form': self._map_form,
        }
    
    def map_components(self, code: str) -> str:
        """执行组件映射"""
        for element, mapper in self.mappers.items():
            code = mapper(code)
        return code
    
    def _map_button(self, code: str) -> str:
        """将 <button> 映射为 <Button>"""
        if self.library == "antd":
            # 检测按钮类型
            def replace_button(match):
                attrs = match.group(1)
                content = match.group(2)
                
                # 推断按钮类型
                btn_type = "default"
                if 'bg-primary' in attrs or 'primary' in attrs:
                    btn_type = "primary"
                elif 'bg-error' in attrs or 'danger' in attrs:
                    btn_type = "primary"  # antd danger 是 primary + danger
                    attrs += ' danger'
                elif 'bg-transparent' in attrs:
                    btn_type = "text"
                
                # 推断大小
                size = "middle"
                if 'px-6' in attrs or 'py-3' in attrs:
                    size = "large"
                elif 'px-2' in attrs or 'py-1' in attrs:
                    size = "small"
                
                return f'<Button type="{btn_type}" size="{size}">{content}</Button>'
            
            pattern = r'<button([^>]*)>(.*?)</button>'
            code = re.sub(pattern, replace_button, code, flags=re.DOTALL)
            
            # 添加导入
            if '<Button' in code and "from 'antd'" not in code:
                code = self._add_antd_import(code, ['Button'])
        
        return code
    
    def _map_input(self, code: str) -> str:
        """将 <input> 映射为 <Input>"""
        if self.library == "antd":
            pattern = r'<input([^>]*)/?>'
            code = re.sub(pattern, r'<Input\1 />', code)
            
            if '<Input' in code and "from 'antd'" not in code:
                code = self._add_antd_import(code, ['Input'])
        
        return code
    
    def _map_table(self, code: str) -> str:
        """将原生表格映射为 <Table>"""
        # 这里需要更复杂的逻辑，将 table/tr/td 结构转换为 antd Table 的 columns + dataSource
        # 简化示例
        if '<table' in code and self.library == "antd":
            # 标记需要人工处理
            code = code.replace('<table', '<!-- TODO: Convert to Antd Table -->\n<table')
        
        return code
    
    def _map_card(self, code: str) -> str:
        """将卡片样式 div 映射为 <Card>"""
        if self.library == "antd":
            # 检测卡片特征：有阴影、圆角、padding
            pattern = r'<div([^>]*class="[^"]*shadow[^"]*rounded[^"]*"[^>]*)>(.*?)</div>'
            
            def replace_card(match):
                attrs = match.group(1)
                content = match.group(2)
                
                # 提取标题（如果有）
                title_match = re.search(r'<h[1-3][^>]*>(.*?)</h[1-3]>', content)
                title = title_match.group(1) if title_match else ''
                
                # 移除标题元素
                if title_match:
                    content = content.replace(title_match.group(0), '')
                
                return f'<Card title="{title}">{content}</Card>'
            
            code = re.sub(pattern, replace_card, code, flags=re.DOTALL)
            
            if '<Card' in code and "from 'antd'" not in code:
                code = self._add_antd_import(code, ['Card'])
        
        return code
    
    def _map_select(self, code: str) -> str:
        """将 <select> 映射为 <Select>"""
        if self.library == "antd":
            pattern = r'<select([^>]*)>(.*?)</select>'
            
            def replace_select(match):
                attrs = match.group(1)
                options_html = match.group(2)
                
                # 提取选项
                options = re.findall(r'<option[^>]*value="([^"]*)"[^>]*>(.*?)</option>', options_html)
                options_str = ', '.join([f'{{ value: "{v}", label: "{l}" }}' for v, l in options])
                
                return f'<Select options={[{options_str}]} />'
            
            code = re.sub(pattern, replace_select, code, flags=re.DOTALL)
            
            if '<Select' in code and "from 'antd'" not in code:
                code = self._add_antd_import(code, ['Select'])
        
        return code
    
    def _map_form(self, code: str) -> str:
        """将 <form> 映射为 <Form>"""
        if self.library == "antd":
            pattern = r'<form([^>]*)>(.*?)</form>'
            
            def replace_form(match):
                attrs = match.group(1)
                content = match.group(2)
                
                # 包装表单项
                content = re.sub(
                    r'(<Input[^>]*/>)',
                    r'<Form.Item label="字段名">\1</Form.Item>',
                    content
                )
                
                return f'<Form layout="vertical">{content}</Form>'
            
            code = re.sub(pattern, replace_form, code, flags=re.DOTALL)
            
            if '<Form' in code and "from 'antd'" not in code:
                code = self._add_antd_import(code, ['Form'])
        
        return code
    
    def _add_antd_import(self, code: str, components: list) -> str:
        """添加 antd 组件导入"""
        import_line = f"import {{ {', '.join(components)} }} from 'antd';\n"
        
        # 检查是否已有 antd 导入
        if "from 'antd'" in code:
            # 合并导入
            pattern = r"import\s*{([^}]*)}\s*from\s*'antd';"
            match = re.search(pattern, code)
            if match:
                existing = match.group(1)
                new_components = set(existing.split(',') + components)
                new_import = f"import {{ {', '.join(sorted(new_components))} }} from 'antd';"
                code = re.sub(pattern, new_import, code)
        else:
            # 在文件开头添加
            lines = code.split('\n')
            last_import_idx = max(i for i, line in enumerate(lines) if line.startswith('import'))
            lines.insert(last_import_idx + 1, import_line)
            code = '\n'.join(lines)
        
        return code
```

---

## 7. 工程化闭环

### 7.1 CI/CD 集成

```yaml
# .gitlab-ci.yml
stages:
  - generate
  - validate
  - test
  - deploy

# 生成代码
generate-ui:
  stage: generate
  script:
    - python scripts/batch_generate.py --designs ./designs/ --output ./src/components/generated/
    - npm run lint:fix
  artifacts:
    paths:
      - ./src/components/generated/
    expire_in: 1 week
  only:
    - merge_requests
    - main

# 视觉校验
visual-validation:
  stage: validate
  script:
    - python scripts/validate_all.py --components ./src/components/generated/ --designs ./designs/
    - python scripts/generate_report.py --output ./reports/
  artifacts:
    paths:
      - ./reports/
    expire_in: 1 week
  allow_failure: false  # 校验失败则流水线失败
  only:
    - merge_requests
    - main

# 单元测试
unit-test:
  stage: test
  script:
    - npm run test:unit
    - npm run test:coverage
  coverage: '/Coverage: \d+\.\d+%/'
  only:
    - merge_requests
    - main

# 部署到测试环境
deploy-staging:
  stage: deploy
  script:
    - npm run build
    - npm run deploy:staging
  environment:
    name: staging
    url: https://staging.internal.example.com
  only:
    - main
```

### 7.2 IDE 插件（MCP Server）

```python
# mcp_server/design_to_code_mcp.py
from mcp.server import Server
from mcp.types import Tool, TextContent, ImageContent
import aiohttp
import base64

server = Server("design-to-code")

@server.tool()
async def generate_component(
    image_path: str,
    framework: str = "react",
    component_library: str = "antd"
) -> str:
    """
    根据设计稿截图生成前端组件代码
    
    Args:
        image_path: 设计稿截图路径（支持本地路径或 base64）
        framework: 目标框架 (react/vue/html)
        component_library: 组件库 (antd/element/none)
    
    Returns:
        生成的组件代码
    """
    # 读取图片
    if image_path.startswith('data:'):
        image_data = image_path
    else:
        with open(image_path, 'rb') as f:
            image_data = f"data:image/png;base64,{base64.b64encode(f.read()).decode()}"
    
    # 调用生成服务
    async with aiohttp.ClientSession() as session:
        async with session.post(
            "http://localhost:7001/api/generate",
            json={
                "image": image_data,
                "framework": framework,
                "component_library": component_library,
                "validate": True  # 自动校验
            }
        ) as resp:
            result = await resp.json()
            
            if result['validation']['passed']:
                return result['code']
            else:
                # 返回代码 + 差异报告
                return f"""
⚠️ 视觉校验未通过 ({result['validation']['similarity']}%)

差异区域：
{chr(10).join([f"- {r['type']}: {r['diff_percentage']}%" for r in result['validation']['regions']])}

修复建议：
{chr(10).join(result['validation']['suggestions'])}

生成的代码：
{result['code']}
"""

@server.tool()
async def validate_design(
    original_image: str,
    code: str
) -> dict:
    """
    校验生成代码与设计稿的还原度
    
    Args:
        original_image: 原始设计稿路径
        code: 生成的 HTML/组件代码
    
    Returns:
        校验结果（相似度、差异区域、修复建议）
    """
    async with aiohttp.ClientSession() as session:
        async with session.post(
            "http://localhost:7001/api/validate",
            json={
                "original_image": original_image,
                "generated_html": code
            }
        ) as resp:
            return await resp.json()

@server.tool()
async def repair_component(
    original_image: str,
    code: str,
    diff_regions: list
) -> str:
    """
    AI 自动修复差异区域
    
    Args:
        original_image: 原始设计稿
        code: 当前代码
        diff_regions: 差异区域列表
    
    Returns:
        修复后的代码
    """
    async with aiohttp.ClientSession() as session:
        async with session.post(
            "http://localhost:7001/api/repair",
            json={
                "original_image": original_image,
                "code": code,
                "diff_regions": diff_regions
            }
        ) as resp:
            result = await resp.json()
            return result['repaired_code']

if __name__ == "__main__":
    server.run()
```

### 7.3 批量生成 CLI

```python
# scripts/batch_generate.py
import argparse
import asyncio
from pathlib import Path
from typing import List

async def batch_generate(
    designs_dir: Path,
    output_dir: Path,
    framework: str,
    validate: bool = True
):
    """批量生成组件代码"""
    
    design_files = list(designs_dir.glob("*.png")) + list(designs_dir.glob("*.jpg"))
    
    results = []
    
    for design_file in design_files:
        print(f"Processing: {design_file.name}")
        
        # 生成代码
        code = await generate_component(
            image_path=str(design_file),
            framework=framework
        )
        
        # 保存代码
        output_file = output_dir / f"{design_file.stem}.tsx"
        output_file.write_text(code)
        
        # 校验
        if validate:
            validation = await validate_design(
                original_image=str(design_file),
                code=code
            )
            
            results.append({
                "design": design_file.name,
                "output": output_file.name,
                "similarity": validation['similarity'],
                "passed": validation['passed']
            })
            
            status = "✅" if validation['passed'] else "❌"
            print(f"  {status} Similarity: {validation['similarity']}%")
    
    # 生成汇总报告
    generate_summary_report(results, output_dir / "report.md")
    
    # 统计
    passed = sum(1 for r in results if r['passed'])
    print(f"\n总计: {len(results)} 个页面")
    print(f"通过: {passed} ({passed/len(results)*100:.1f}%)")
    print(f"失败: {len(results) - passed}")

def generate_summary_report(results: List[dict], output_path: Path):
    """生成汇总报告"""
    report = "# 批量生成校验报告\n\n"
    report += "| 设计稿 | 生成文件 | 相似度 | 状态 |\n"
    report += "|--------|----------|--------|------|\n"
    
    for r in results:
        status = "✅ 通过" if r['passed'] else "❌ 失败"
        report += f"| {r['design']} | {r['output']} | {r['similarity']}% | {status} |\n"
    
    output_path.write_text(report)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="批量生成前端组件")
    parser.add_argument("--designs", required=True, help="设计稿目录")
    parser.add_argument("--output", required=True, help="输出目录")
    parser.add_argument("--framework", default="react", choices=["react", "vue", "html"])
    parser.add_argument("--no-validate", action="store_true", help="跳过校验")
    
    args = parser.parse_args()
    
    asyncio.run(batch_generate(
        designs_dir=Path(args.designs),
        output_dir=Path(args.output),
        framework=args.framework,
        validate=not args.no_validate
    ))
```

---

## 8. 落地路线图

### Phase 0：环境准备（第 1 周）

| 任务 | 负责人 | 产出 | 状态 |
|------|--------|------|------|
| 确认内网模型服务可用 | 算法 | Qwen3.5-VL / GLM 5.3 端点文档 | ☐ |
| 部署 screenshot-to-code | 前端 | 基础服务运行 | ☐ |
| 部署 Playwright 渲染节点 | 运维 | 渲染服务可用 | ☐ |
| 验证模型对接 | 前端 | 简单页面生成成功 | ☐ |

### Phase 1：基础功能（第 2 周）

| 任务 | 负责人 | 产出 | 状态 |
|------|--------|------|------|
| 修改 Prompt 适配中文 UI | 前端 | 中文 Prompt 模板 | ☐ |
| 实现视觉校验核心逻辑 | 前端 | 校验 API 可用 | ☐ |
| 开发校验结果展示界面 | 前端 | Web 校验面板 | ☐ |
| 简单页面端到端验证 | 前端 | 登录页/表单页 demo | ☐ |

### Phase 2：设计系统对接（第 3-4 周）

| 任务 | 负责人 | 产出 | 状态 |
|------|--------|------|------|
| 梳理 Design Token | 设计+前端 | Token 文档 | ☐ |
| 实现 Token 自动映射 | 前端 | 后处理引擎 | ☐ |
| 实现组件库映射 | 前端 | 组件自动识别 | ☐ |
| 复杂页面验证 | 前端 | Dashboard/列表页 demo | ☐ |

### Phase 3：工程化闭环（第 5-6 周）

| 任务 | 负责人 | 产出 | 状态 |
|------|--------|------|------|
| 开发 MCP Server | 前端 | IDE 插件 | ☐ |
| 开发批量生成 CLI | 前端 | 批量转换工具 | ☐ |
| CI/CD 集成 | 运维 | 自动化流水线 | ☐ |
| 团队培训与推广 | 前端 | 使用文档/培训 | ☐ |

### Phase 4：持续优化（第 7-8 周及以后）

| 任务 | 负责人 | 产出 | 状态 |
|------|--------|------|------|
| 收集使用反馈 | 全员 | 反馈清单 | ☐ |
| 优化 Prompt 和模型 | 算法 | 准确率提升 | ☐ |
| 扩展组件库覆盖 | 前端 | 更多组件支持 | ☐ |
| 建立质量看板 | 前端 |  metrics 可视化 | ☐ |

---

## 9. 风险与应对

| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|---------|
| **模型识别准确率不足** | 生成代码质量差 | 中 | 1. 优化 Prompt 工程<br>2. 收集 bad case 微调模型<br>3. 人工校准流程兜底 |
| **视觉校验误报/漏报** | 质量门禁失效 | 中 | 1. 调整相似度阈值<br>2. 结合人工抽检<br>3. 多维度校验（像素+结构+语义） |
| **设计系统对接复杂** | 落地周期延长 | 高 | 1. 先覆盖 80% 常用场景<br>2. 分阶段对接<br>3. 保留人工调整入口 |
| **团队接受度低** | 工具闲置 | 中 | 1. 早期种子用户试点<br>2. 展示效率提升数据<br>3. 降低使用门槛（IDE 插件） |
| **性能瓶颈** | 生成速度慢 | 低 | 1. 模型服务横向扩展<br>2. 缓存高频结果<br>3. 异步生成 + 通知 |

---

## 10. 附录

### 10.1 参考资源

| 资源 | 链接 | 说明 |
|------|------|------|
| screenshot-to-code | https://github.com/abi/screenshot-to-code | 基础框架 |
| Qwen3.5-VL | 内网模型服务 | 视觉理解 |
| GLM 5.3 | 内网模型服务 | 代码生成 |
| Playwright | https://playwright.dev | 浏览器自动化 |
| Pixelmatch | https://github.com/mapbox/pixelmatch | 像素对比 |

### 10.2 关键文件清单

```
project/
├── backend/
│   ├── config.py                 # 配置文件
│   ├── llm/
│   │   └── internal_client.py    # 内网模型客户端
│   ├── prompts/
│   │   ├── structure_analysis.py # 结构解析 Prompt
│   │   └── code_generation.py    # 代码生成 Prompt
│   ├── codegen/
│   │   ├── token_mapper.py       # Token 映射
│   │   └── component_mapper.py   # 组件映射
│   ├── evals/
│   │   └── visual_validator.py   # 视觉校验器
│   └── routes/
│       └── validation.py         # 校验 API
├── frontend/
│   └── src/
│       └── components/
│           └── ValidationPanel.tsx  # 校验结果展示
├── mcp_server/
│   └── design_to_code_mcp.py     # MCP Server
├── scripts/
│   ├── batch_generate.py         # 批量生成 CLI
│   └── validate_all.py           # 批量校验
├── docker-compose.internal.yml   # 内网部署配置
└── docs/
    └── design-to-code-solution.md # 本文档
```

### 10.3 常用命令

```bash
# 启动服务
docker-compose -f docker-compose.internal.yml up -d

# 查看日志
docker-compose -f docker-compose.internal.yml logs -f backend

# 批量生成
python scripts/batch_generate.py --designs ./designs/ --output ./src/components/ --framework react

# 批量校验
python scripts/validate_all.py --components ./src/components/ --designs ./designs/

# 运行测试
npm run test:visual-regression

# 查看报告
open ./reports/visual-validation-report.html
```

### 10.4 联系与支持

| 角色 | 负责人 | 联系方式 |
|------|--------|---------|
| 方案架构 | [待填写] | [待填写] |
| 前端开发 | [待填写] | [待填写] |
| 算法支持 | [待填写] | [待填写] |
| 运维支持 | [待填写] | [待填写] |

---

## 变更记录

| 版本 | 日期 | 变更内容 | 作者 |
|------|------|---------|------|
| v1.0 | 2026-11-08 | 初始版本 | [待填写] |

---

**文档结束**
