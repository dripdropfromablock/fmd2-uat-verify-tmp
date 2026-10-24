import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { collectWorkspaceReleaseFiles } from './githubReleasePublisher.ts';

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fmd2-collector-'));
  // Legitimate files
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"fixture"}');
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'main.js'), '// app');
  fs.writeFileSync(path.join(root, 'README.md'), '# fixture');
  // Excluded entries
  fs.writeFileSync(path.join(root, '.env'), 'SECRET=1');
  fs.mkdirSync(path.join(root, '.fmd2-data'));
  fs.writeFileSync(path.join(root, '.fmd2-data', 'download-tasks.json'), '[]');
  fs.mkdirSync(path.join(root, 'node_modules', 'left-pad'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'left-pad', 'index.js'), '//');
  fs.mkdirSync(path.join(root, 'dist-electron'));
  fs.writeFileSync(path.join(root, 'dist-electron', 'main.cjs'), '//');
  fs.mkdirSync(path.join(root, 'logs'));
  fs.writeFileSync(path.join(root, 'logs', 'fmd2-studio.log'), 'log');
  // Nested .env
  fs.writeFileSync(path.join(root, 'src', '.env'), 'SECRET=2');
  return root;
}

test('collector force-excludes .env, .fmd2-data, node_modules, dist-electron, logs at any depth', () => {
  const files = collectWorkspaceReleaseFiles(makeRoot()).map((f) => f.relativePath.replace(/\\/g, '/'));
  const joined = files.join('\n');
  assert.ok(files.some((f) => f.endsWith('package.json')));
  assert.ok(files.some((f) => f.endsWith('src/main.js')));
  assert.ok(files.some((f) => f.endsWith('README.md')));
  assert.equal(files.some((f) => f.includes('.env')), false, '.env must never be collected');
  assert.equal(files.some((f) => f.includes('.fmd2-data')), false);
  assert.equal(files.some((f) => f.includes('node_modules')), false);
  assert.equal(files.some((f) => f.includes('dist-electron')), false);
  assert.equal(files.some((f) => f.includes('logs/')), false);
  void joined;
});

test('collector output is non-empty for a legitimate root', () => {
  const files = collectWorkspaceReleaseFiles(makeRoot());
  assert.ok(files.length >= 3);
});

test('publisher source has no child_process git dependency (D-16 REST-only)', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src', 'server', 'githubReleasePublisher.ts'),
    'utf8'
  );
  assert.equal(/child_process/.test(source), false);
});
