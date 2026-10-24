import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './createServer.ts';

function req(
  port: number,
  pathName: string,
  { method = 'GET', headers = {}, body }: { method?: string; headers?: Record<string, string>; body?: string } = {}
) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const r = http.request(
      { host: '127.0.0.1', port, path: pathName, method, headers },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
      }
    );
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

async function bootWithKey(key: string | undefined) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fmd2-ai-'));
  process.env.FMD_DATA_DIR = dataDir;
  if (key === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = key;
  const mod = await import('./createServer.ts');
  // Module-level getGeminiClient reads env at call time, but the engine singleton
  // caches at import — use a fresh registry per state via querystring-free import
  // is impossible in one process, so createApp reads env lazily per request.
  const running = await mod.startServer({
    mode: 'production',
    host: '127.0.0.1',
    port: 0,
    projectRoot: process.cwd(),
  });
  return running;
}

test('AI discovery without GEMINI_API_KEY returns the clear configuration message', async () => {
  const running = await bootWithKey(undefined);
  try {
    const res = await req(running!.port, '/api/ai/discover', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
    });
    assert.equal(res.status, 503);
    assert.match(res.body, /GEMINI_API_KEY/);
    assert.match(res.body, /not configured/i);
    assert.doesNotMatch(res.body, /\.env/);
  } finally {
    await running.close();
  }
});

test('placeholder MY_GEMINI_API_KEY is treated as absent', async () => {
  const running = await bootWithKey('MY_GEMINI_API_KEY');
  try {
    const res = await req(running!.port, '/api/ai/discover', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
    });
    assert.equal(res.status, 503);
    assert.match(res.body, /GEMINI_API_KEY/);
  } finally {
    await running.close();
  }
});
