import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import { createRemoteMCPServer } from '../mcp/remote-server.js';
import type { ServerConfig } from './config.js';
import type { JobService } from './job-service.js';
import { JobServiceMCPClient } from './mcp-generation.js';

interface MCPRequest extends Request {
  userId?: string;
}

function jsonRpcError(res: Response, status: number, code: number, message: string, id: unknown = null) {
  res.status(status).json({ jsonrpc: '2.0', error: { code, message }, id });
}

/** Native stateless Streamable HTTP MCP endpoint for remote AI clients. */
export function createMcpHttpHandler(options: { service: JobService; config: ServerConfig }) {
  return async (req: MCPRequest, res: Response): Promise<void> => {
    if (req.method !== 'POST') {
      res.set('Allow', 'POST');
      jsonRpcError(res, 405, -32000, 'Method not allowed; use POST for the stateless MCP endpoint');
      return;
    }

    const client = new JobServiceMCPClient({
      service: options.service,
      config: options.config,
      userId: req.userId!,
      pollIntervalMs: Number(process.env.IMAGE2HTML_POLL_INTERVAL_MS || 100),
      timeoutMs: Number(process.env.IMAGE2HTML_TIMEOUT_MS || 600_000),
    });
    const server = await createRemoteMCPServer({ client });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('[mcp-http] request failed', error);
      if (!res.headersSent) {
        jsonRpcError(res, 500, -32603, 'Internal MCP server error', (req.body as { id?: unknown })?.id ?? null);
      }
    } finally {
      await transport.close();
      await server.close();
    }
  };
}
