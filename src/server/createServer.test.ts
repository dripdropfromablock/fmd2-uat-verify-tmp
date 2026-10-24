import net from 'node:net';
import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, startServer, resolveSourceRunConfig } from './createServer.ts';

const LAUNCH_TOKEN = 'integration-launch-token-0123456789abcdef';

function listenOn(port: number): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function closeServer(server: net.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

interface RawResponse {
  status: number;
  body: string;
}

function rawRequest(
  port: number,
  path: string,
  options: { method?: string; hostHeader?: string; headers?: Record<string, string> } = {}
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: options.method ?? 'GET',
        headers: {
          ...(options.hostHeader ? { host: options.hostHeader } : {}),
          ...(options.headers ?? {}),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => {
          body += chunk.toString('utf8');
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

test('resolveSourceRunConfig preserves the source-run contract', () => {
  const dev = resolveSourceRunConfig({}, '/project/root');
  assert.equal(dev.port, 3000);
  assert.equal(dev.host, '127.0.0.1');
  assert.equal(dev.mode, 'dev');
  assert.equal(dev.projectRoot, '/project/root');

  const prod = resolveSourceRunConfig({ NODE_ENV: 'production' }, '/project/root');
  assert.equal(prod.host, '0.0.0.0');
  assert.equal(prod.mode, 'production');

  const envPort = resolveSourceRunConfig({ PORT: '4599', HOST: '0.0.0.0' }, '/project/root');
  assert.equal(envPort.port, 4599);
  assert.equal(envPort.host, '0.0.0.0');
});

test('desktop factory binds 127.0.0.1:0 and reports the OS-assigned port with healthy endpoint', async () => {
  const running = await startServer({
    mode: 'production',
    host: '127.0.0.1',
    port: 0,
    projectRoot: process.cwd(),
    launchToken: LAUNCH_TOKEN,
  });
  try {
    assert.ok(Number.isInteger(running.port) && running.port > 0);
    assert.equal(running.host, '127.0.0.1');
    const health = await rawRequest(running.port, '/api/health');
    assert.equal(health.status, 200);
    assert.deepEqual(JSON.parse(health.body), { ok: true });
  } finally {
    await running.close();
  }
});

test('factory starts even while ports 3000 and 24678 are occupied', async () => {
  const a = await listenOn(3000);
  const b = await listenOn(24678);
  try {
    const running = await startServer({
      mode: 'production',
      host: '127.0.0.1',
      port: 0,
      projectRoot: process.cwd(),
      launchToken: LAUNCH_TOKEN,
    });
    try {
      assert.notEqual(running.port, 3000);
      assert.notEqual(running.port, 24678);
      const health = await rawRequest(running.port, '/api/health');
      assert.equal(health.status, 200);
    } finally {
      await running.close();
    }
  } finally {
    await closeServer(a);
    await closeServer(b);
  }
});

test('mutations require studio origin plus per-launch token at the boundary', async () => {
  const running = await startServer({
    mode: 'production',
    host: '127.0.0.1',
    port: 0,
    projectRoot: process.cwd(),
    launchToken: LAUNCH_TOKEN,
  });
  try {
    const noOrigin = await rawRequest(running.port, '/api/engine/batch-control', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(noOrigin.status, 403);

    const evilOrigin = await rawRequest(running.port, '/api/engine/batch-control', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://evil.example' },
    });
    assert.equal(evilOrigin.status, 403);

    const wrongToken = await rawRequest(running.port, '/api/engine/batch-control', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'fmd2://studio',
        'x-fmd2-launch': 'wrong-token-totally-different-length!!',
      },
    });
    assert.equal(wrongToken.status, 403);

    const wrongLengthToken = await rawRequest(running.port, '/api/engine/batch-control', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'fmd2://studio', 'x-fmd2-launch': 'abc' },
    });
    assert.equal(wrongLengthToken.status, 403);

    const credentialed = await rawRequest(running.port, '/api/engine/batch-control', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'fmd2://studio',
        'x-fmd2-launch': LAUNCH_TOKEN,
      },
    });
    assert.equal(credentialed.status, 400);
    assert.match(credentialed.body, /Missing batch action/);
  } finally {
    await running.close();
  }
});

test('GETs pass the boundary on loopback Host but reject spoofed Hosts', async () => {
  const running = await startServer({
    mode: 'production',
    host: '127.0.0.1',
    port: 0,
    projectRoot: process.cwd(),
    launchToken: LAUNCH_TOKEN,
  });
  try {
    const good = await rawRequest(running.port, '/api/health', {
      hostHeader: `127.0.0.1:${running.port}`,
    });
    assert.equal(good.status, 200);

    const spoofed = await rawRequest(running.port, '/api/health', {
      hostHeader: 'localhost:9999',
    });
    assert.equal(spoofed.status, 403);
  } finally {
    await running.close();
  }
});

test('source-run mode without launchToken keeps legacy open behavior', async () => {
  const running = await startServer({
    mode: 'production',
    host: '127.0.0.1',
    port: 0,
    projectRoot: process.cwd(),
  });
  try {
    const health = await rawRequest(running.port, '/api/health');
    assert.equal(health.status, 200);
    const mutation = await rawRequest(running.port, '/api/engine/batch-control', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(mutation.status, 400);
    assert.match(mutation.body, /Missing batch action/);
  } finally {
    await running.close();
  }
});
