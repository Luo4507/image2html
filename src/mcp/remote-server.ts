import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, type Tool } from '@modelcontextprotocol/sdk/types.js';
import { toolDefinitions } from './tool-schemas.js';
import { getRemoteMCPConfig, RemoteMCPClient } from './remote-client.js';
import { toolError, type MCPToolResult } from './results.js';

export interface RemoteToolExecutor {
  generateComponent(args: any, onStatus?: (status: string) => void): Promise<MCPToolResult>;
  validateDesign(args: any, onStatus?: (status: string) => void): Promise<MCPToolResult>;
  repairComponent(args: any, onStatus?: (status: string) => void): Promise<MCPToolResult>;
  analyzeStructure(args: any, onStatus?: (status: string) => void): Promise<MCPToolResult>;
  extractAssets(args: any, onStatus?: (status: string) => void): Promise<MCPToolResult>;
}

const localTools = Object.fromEntries(toolDefinitions.map((tool) => [tool.name, tool]));
const imageFilename = {
  type: 'string',
  description: 'Base64 图片的文件名，用于识别 PNG、JPG、JPEG 或 WebP 格式',
};
const imagePath = {
  type: 'string',
  description: '图片绝对路径；必须位于运行该入口的机器可见文件系统中。与 image_base64 二选一',
};
const imageBase64 = {
  type: 'string',
  description: '图片 Base64 内容，支持 data:image/png;base64,... 等 Data URL；纯 Base64 需同时提供 image_filename',
};
const originalImage = {
  type: 'string',
  description: '原始设计稿路径；必须位于运行该入口的机器可见文件系统中。与 original_image_base64 二选一',
};
const originalImageBase64 = {
  type: 'string',
  description: '原始设计稿 Base64 内容，支持 Data URL；纯 Base64 需同时提供 image_filename',
};

function remoteInput(tool: Tool, properties: Record<string, unknown>, required: string[] = []) {
  return {
    ...tool.inputSchema,
    properties: { ...tool.inputSchema.properties, ...properties },
    required,
  };
}

const remoteGenerateTool = {
  ...localTools.generate_component,
  description: '通过集中服务生成组件，支持服务端图片路径或调用方上传 Base64 图片。',
  inputSchema: remoteInput(localTools.generate_component, {
    image_path: imagePath,
    image_base64: imageBase64,
    image_filename: imageFilename,
    asset_mode: {
      type: 'string',
      enum: ['none'],
      default: 'none',
      description: '生成任务不直接返回分离资源；需要提取资源时调用 extract_assets',
    },
  }),
};

const remoteValidateTool = {
  ...localTools.validate_design,
  inputSchema: remoteInput(localTools.validate_design, {
    original_image: originalImage,
    original_image_base64: originalImageBase64,
    image_filename: imageFilename,
  }, ['code']),
};

const remoteRepairTool = {
  ...localTools.repair_component,
  inputSchema: remoteInput(localTools.repair_component, {
    original_image: originalImage,
    original_image_base64: originalImageBase64,
    image_filename: imageFilename,
  }, ['code']),
};

const remoteAnalyzeTool = {
  ...localTools.analyze_structure,
  inputSchema: remoteInput(localTools.analyze_structure, {
    image_path: imagePath,
    image_base64: imageBase64,
    image_filename: imageFilename,
  }),
};

const remoteExtractTool = {
  ...localTools.extract_assets,
  description: '识别并裁剪 Logo、图标和图片，通过 assets 返回文件名、MIME 类型和 Base64 图片数据。',
  inputSchema: remoteInput(localTools.extract_assets, {
    image_path: imagePath,
    image_base64: imageBase64,
    image_filename: imageFilename,
    output_dir: {
      type: 'string',
      description: '兼容本地调用的可选字段；远程模式忽略该字段，图片通过 assets 返回',
    },
  }),
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      assets: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            mimeType: { type: 'string' },
            data: { type: 'string', description: '纯 Base64 图片内容，不包含 Data URL 前缀' },
          },
          required: ['name', 'mimeType', 'data'],
        },
      },
      error: localTools.extract_assets.outputSchema?.properties?.error,
    },
    required: ['success'],
  },
};

const remoteTools = [
  remoteGenerateTool,
  remoteValidateTool,
  remoteRepairTool,
  remoteAnalyzeTool,
  remoteExtractTool,
];

export async function createRemoteMCPServer(options: { client?: RemoteToolExecutor } = {}) {
  const client = options.client || new RemoteMCPClient(getRemoteMCPConfig());
  const server = new Server(
    { name: 'design-to-code-remote', version: '0.3.0' },
    { capabilities: { tools: {}, logging: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: remoteTools }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const onStatus = (status: string) => {
      void extra.sendNotification({
        method: 'notifications/message',
        params: {
          level: 'info',
          logger: 'design-to-code-remote',
          data: { status, message: `集中任务状态: ${status}` },
        },
      }).catch((error) => console.error('[remote-mcp] Failed to send status notification', error));
    };

    try {
      switch (request.params.name) {
        case 'generate_component':
          return await client.generateComponent(request.params.arguments, onStatus);
        case 'validate_design':
          return await client.validateDesign(request.params.arguments, onStatus);
        case 'repair_component':
          return await client.repairComponent(request.params.arguments, onStatus);
        case 'analyze_structure':
          return await client.analyzeStructure(request.params.arguments, onStatus);
        case 'extract_assets':
          return await client.extractAssets(request.params.arguments, onStatus);
        default:
          return toolError('UNKNOWN_TOOL', `未知远程工具: ${request.params.name}`);
      }
    } catch (error) {
      return toolError('REMOTE_REQUEST_FAILED', error instanceof Error ? error.message : String(error));
    }
  });
  return server;
}

export async function startRemoteMCPServer() {
  const server = await createRemoteMCPServer();
  await server.connect(new StdioServerTransport());
  console.error('[remote-mcp] Connected to the company image2html service');
  console.error(`[remote-mcp] Available tools: ${remoteTools.map((tool) => tool.name).join(', ')}`);
}
