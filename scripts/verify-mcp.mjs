import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client(
  { name: 'design-to-code-verifier', version: '1.0.0' },
  { capabilities: {} }
);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/mcp/index.js'],
  cwd: process.cwd(),
  env: process.env,
  stderr: 'pipe',
});

try {
  await client.connect(transport);
  const tools = await client.listTools();
  console.log(`MCP tools: ${tools.tools.map((tool) => tool.name).join(', ')}`);

  const code = await readFile(process.argv[2] || 'examples/demo/login-design.html', 'utf8');
  const result = await client.callTool({
    name: 'validate_design',
    arguments: {
      original_image: resolve('examples/demo/login-design.png'),
      code,
      threshold: 85,
    },
  });

  console.log(result.content[0].text);
} finally {
  await client.close();
}
