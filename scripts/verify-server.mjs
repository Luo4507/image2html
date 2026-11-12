import { spawn } from 'node:child_process';
import { open } from 'node:fs/promises';

const port = Number(process.env.VERIFY_PORT || 3100);
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['dist/server/index.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    API_KEYS: 'verify-user:verify-secret',
    DATA_DIR: 'output/server-verification',
    JOB_CONCURRENCY: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

child.stdout.on('data', (chunk) => process.stdout.write(chunk));
child.stderr.on('data', (chunk) => process.stderr.write(chunk));

async function waitForHealth() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Server did not become healthy');
}

try {
  await waitForHealth();
  console.log('Health check: OK');

  const unauthorized = await fetch(`${baseUrl}/v1/jobs`);
  if (unauthorized.status !== 401) throw new Error('Authentication check failed');
  console.log('Authentication check: OK');

  const form = new FormData();
  const file = await open('examples/fixtures/demo/login.png');
  try {
    const buffer = await file.readFile();
    form.append('image', new Blob([buffer], { type: 'image/png' }), 'login.png');
  } finally {
    await file.close();
  }
  form.append('framework', 'html');
  form.append('styleFramework', 'inline');
  form.append('componentLibrary', 'none');
  form.append('typescript', 'false');

  const createdResponse = await fetch(`${baseUrl}/v1/jobs`, {
    method: 'POST',
    headers: { Authorization: 'Bearer verify-secret' },
    body: form,
  });
  if (createdResponse.status !== 202) {
    throw new Error(`Job creation failed: ${await createdResponse.text()}`);
  }
  const { job } = await createdResponse.json();
  console.log(`Job created: ${job.id}`);

  let previewSeen = false;
  const eventStages = [];
  const eventsPromise = (async () => {
    const response = await fetch(`${baseUrl}/v1/jobs/${job.id}/events`, {
      headers: { Authorization: 'Bearer verify-secret' },
    });
    if (!response.ok || !response.body) throw new Error('SSE connection failed');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() || '';
      for (const block of blocks) {
        const line = block.split('\n').find((item) => item.startsWith('data: '));
        if (!line) continue;
        const event = JSON.parse(line.slice(6));
        eventStages.push(event.stage);
        if (event.codeSnapshot) previewSeen = true;
      }
    }
  })();

  let completed;
  for (let attempt = 0; attempt < 900; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const response = await fetch(`${baseUrl}/v1/jobs/${job.id}`, {
      headers: { Authorization: 'Bearer verify-secret' },
    });
    const payload = await response.json();
    if (payload.job.status === 'failed') {
      throw new Error(payload.job.error || 'Job failed');
    }
    if (payload.job.status === 'succeeded') {
      completed = payload.job;
      break;
    }
  }
  if (!completed) throw new Error('Job polling timed out');

  await eventsPromise;
  const previewResponse = await fetch(`${baseUrl}/v1/jobs/${job.id}/preview`, {
    headers: { Authorization: 'Bearer verify-secret' },
  });
  const preview = await previewResponse.text();
  if (!previewResponse.ok || !preview.includes('<')) throw new Error('Preview check failed');

  const codeResponse = await fetch(`${baseUrl}${completed.result.artifacts.code}`, {
    headers: { Authorization: 'Bearer verify-secret' },
  });
  const code = await codeResponse.text();
  if (!codeResponse.ok || !code.includes('<')) throw new Error('Artifact download failed');

  console.log(`Job completed: ${completed.status}`);
  console.log(`Similarity: ${completed.result.similarity ?? 'not validated'}%`);
  console.log(`SSE stages: ${[...new Set(eventStages)].join(', ')}`);
  console.log(`Live preview received: ${previewSeen}`);
  console.log('Artifact download: OK');
} finally {
  child.kill('SIGTERM');
}
