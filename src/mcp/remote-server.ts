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
  description: '通过公司内网集中服务生成组件；本地适配器上传图片、轮询任务并返回源码。仅远程开放此工具。',
  inputSchema: {
    ...generateComponentTool.inputSchema,
    properties: {
      ...generateComponentTool.inputSchema.properties,
      asset_mode: {
        type: 'string',
        enum: ['none'],
        default: 'none',
        description: '远程适配器不下载分离资源；需要资源提取时请使用本地 MCP',
      },
    },
  },
};

export async function createRemoteMCPServer(options: { client?: RemoteGenerationExecutor } = {}) {
  const client = options.client || new RemoteMCPClient(getRemoteMCPConfig());
  const server = new Server(
    { name: 'design-to-code-remote', version: '0.1.0' },
    { capabilities: { tools: {} } },
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
