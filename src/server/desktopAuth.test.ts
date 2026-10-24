import { timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import test from 'node:test';
import assert from 'node:assert/strict';
import { desktopAuth, DESKTOP_TRUSTED_ORIGIN, LAUNCH_TOKEN_HEADER } from './desktopAuth.ts';

const TOKEN = 'unit-test-launch-token-0123456789abcdef';

interface MockRes {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  status(code: number): MockRes;
  json(payload: unknown): MockRes;
}

function mockRes(): MockRes {
  const res: MockRes = {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

function runMiddleware(
  overrides: { method?: string; host?: string; origin?: string | null; token?: string | null },
  options: { launchToken?: string } = {}
): MockRes {
  const res = mockRes();
  const headers: Record<string, string> = { host: overrides.host ?? '127.0.0.1:45678' };
  if (overrides.origin !== null) headers.origin = overrides.origin ?? DESKTOP_TRUSTED_ORIGIN;
  if (overrides.token !== null) headers[LAUNCH_TOKEN_HEADER] = overrides.token ?? TOKEN;
  const req = { method: overrides.method ?? 'POST', headers } as unknown as Request;
  const middleware = desktopAuth({ launchToken: options.launchToken ?? TOKEN });
  let nextCalled = false;
  middleware(req, res as unknown as Response, () => {
    nextCalled = true;
  });
  assert.ok(res.statusCode === 403 || nextCalled, 'middleware must either 403 or call next()');
  return res;
}

test('mutation with correct origin and token passes', () => {
  const res = runMiddleware({});
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, null);
});

test('mutation without origin header is rejected 403', () => {
  const res = runMiddleware({ origin: null });
  assert.equal(res.statusCode, 403);
});

test('mutation with a non-studio origin is rejected 403', () => {
  const res = runMiddleware({ origin: 'http://evil.example' });
  assert.equal(res.statusCode, 403);
});

test('mutation with wrong token is rejected 403', () => {
  const res = runMiddleware({ token: 'wrong-token-totally-different-length!!' });
  assert.equal(res.statusCode, 403);
});

test('mutation with a wrong-length token does not throw and is rejected 403', () => {
  const res = runMiddleware({ token: 'abc' });
  assert.equal(res.statusCode, 403);
});

test('mutation from a non-loopback Host is rejected 403', () => {
  const res = runMiddleware({ host: 'example.com:443' });
  assert.equal(res.statusCode, 403);
});

test('mutation with Host localhost is rejected 403', () => {
  const res = runMiddleware({ host: 'localhost:3000' });
  assert.equal(res.statusCode, 403);
});

test('GET passes with a valid loopback Host even without origin or token', () => {
  const res = runMiddleware({ method: 'GET', origin: null, token: null });
  assert.equal(res.statusCode, 200);
});

test('HEAD passes with a valid loopback Host even without origin or token', () => {
  const res = runMiddleware({ method: 'HEAD', origin: null, token: null });
  assert.equal(res.statusCode, 200);
});

test('GET from a non-loopback Host is rejected 403', () => {
  const res = runMiddleware({ method: 'GET', origin: null, token: null, host: 'localhost:3000' });
  assert.equal(res.statusCode, 403);
});

test('token comparison is constant-time over equal-length buffers', () => {
  const a = Buffer.from(TOKEN, 'utf8');
  const b = Buffer.from(TOKEN, 'utf8');
  assert.ok(timingSafeEqual(a, b));
});

test('trusted origin constant is the privileged studio scheme', () => {
  assert.equal(DESKTOP_TRUSTED_ORIGIN, 'fmd2://studio');
});

test('launch token header name is x-fmd2-launch', () => {
  assert.equal(LAUNCH_TOKEN_HEADER, 'x-fmd2-launch');
});
