import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export type MCPToolResult = CallToolResult;

export function toolError(code: string, message: string): MCPToolResult {
  return {
    content: [{ type: 'text', text: `❌ ${message}` }],
    structuredContent: { success: false, error: { code, message } },
    isError: true,
  };
}
