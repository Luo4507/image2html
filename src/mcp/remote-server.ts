import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { generateComponentTool } from './tool-schemas.js';
import { getRemoteMCPConfig, RemoteMCPClient } from './remote-client.js';
import { toolError } from './results.js';

interface RemoteGenerationExecutor {
  generateComponent(args: any, onStatus?: (status: string) => void): ReturnType<RemoteMCPClient['generateComponent']>;
}

const remoteGenerateTool = {
  ...generateComponentTool,
  description: '通过公司内网集中服务生成组件；支持服务端可见图片路径或远程调用方上传 Base64 图片。仅远程开放此工具。',
  inputSchema: {
    ...generateComponentTool.inputSchema,
    properties: {
      ...generateComponentTool.inputSchema.properties,
      image_path: {
        type: 'string',
        description: '图片绝对路径；必须位于运行该入口的机器可见文件系统中。与 image_base64 二选一',
      },
      image_base64: {
        type: 'string',
        description: '图片 Base64 内容，支持 data:image/png;base64,... 等 Data URL；纯 Base64 需同时提供 image_filename',
      },
      image_filename: {
        type: 'string',
        description: 'Base64 图片的文件名，用于识别 PNG、JPG、JPEG 或 WebP 格式',
      },
      asset_mode: {
        type: 'string',
        enum: ['none'],
        default: 'none',
        description: '远程生成不下载分离资源；需要资源提取时请使用本地 MCP',
      },
    },
    required: [],
  },
};

export async function createRemoteMCPServer(options: { client?: RemoteGenerationExecutor } = {}) {
  const client = options.client || new RemoteMCPClient(getRemoteMCPConfig());
  const server = new Server(
    { name: 'design-to-code-remote', version: '0.1.0' },
    { capabilities: { tools: {}, logging: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [remoteGenerateTool] }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    if (request.params.name !== 'generate_component') {
      return toolError('UNKNOWN_TOOL', `远程适配器仅支持 generate_component，不支持: ${request.params.name}`);
    }
    try {
      return await client.generateComponent(request.params.arguments, (status) => {
        void extra.sendNotification({
          method: 'notifications/message',
          params: {
            level: 'info',
            logger: 'design-to-code-remote',
            data: { status, message: `集中任务状态: ${status}` },
          },
        }).catch((error) => console.error('[remote-mcp] Failed to send status notification', error));
      });
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
  console.error('[remote-mcp] Available tool: generate_component');
}
