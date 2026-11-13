import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { VisualValidator } from '../src/validator/visual-validator.js';
import { getDefaultValidationConfig } from '../src/config.js';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { await Promise.all(cleanup.splice(0).map((close) => close())); });

async function slowServer(initialDelayMs: number, scriptDelayMs: number) {
  const server = createServer((req, res) => {
    if (req.url === '/slow.js') {
      setTimeout(() => { res.setHeader('Content-Type', 'text/javascript'); res.end(''); }, scriptDelayMs);
      return;
    }
    setTimeout(() => {
      res.setHeader('Content-Type', 'text/html');
      res.end('<div id="root"><main>Ready</main><script src="/slow.js"></script></div>');
    }, initialDelayMs);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  cleanup.push(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return url;
}

describe('framework render readiness', () => {
  it('renders after DOM readiness while a script is still pending', async () => {
    const url = await slowServer(0, 5000);
    const validator = new VisualValidator({ ...getDefaultValidationConfig(), navigationTimeoutMs: 1000 });
    cleanup.push(() => validator.close());

    const result = await (validator as any).renderHtml(
      { content: url, isUrl: true, framework: 'react' },
      { width: 400, height: 300 },
    );

    expect(result.screenshot.length).toBeGreaterThan(100);
    expect(result.layout.pendingRequests).toContain(`${url}/slow.js`);
  }, 10_000);

  it('continues when navigation times out after the root has mounted', async () => {
    const url = await slowServer(200, 0);
    const validator = new VisualValidator({ ...getDefaultValidationConfig(), navigationTimeoutMs: 50 });
    cleanup.push(() => validator.close());

    const result = await (validator as any).renderHtml(
      { content: url, isUrl: true, framework: 'react' },
      { width: 400, height: 300 },
    );

    expect(result.layout.navigationWarning).toMatch(/timeout/i);
    expect(result.screenshot.length).toBeGreaterThan(100);
  }, 10_000);
});
