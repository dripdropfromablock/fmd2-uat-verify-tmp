import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

// The engine resolves its data root from FMD_DATA_DIR at import time; point it
// at a temp dir BEFORE importing so tests never touch real user data.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fmd2-shutdown-test-'));
process.env.FMD_DATA_DIR = dataDir;

const { fmdEngine } = await import('./fmdEngine.ts');

type SeededTask = {
  id: string;
  mangaTitle: string;
  format: 'CBZ' | 'ZIP';
  status: string;
  sourceId: string;
  luaModule: string;
  slug?: string;
  chapters?: unknown[];
  totalPages?: number;
};

function seedDownloadingTask(id: string): SeededTask {
  const task: SeededTask = {
    id,
    mangaTitle: 'Shutdown Fixture',
    format: 'CBZ',
    status: 'downloading',
    sourceId: 'weebcentral',
    luaModule: 'WeebCentral.lua',
    totalPages: 4,
  };
  const engine = fmdEngine as unknown as {
    tasks: SeededTask[];
    activeTaskControllers: Map<string, AbortController>;
    activeTaskPromises: Map<string, Promise<void>>;
  };
  engine.tasks.push(task);
  engine.activeTaskControllers.set(id, new AbortController());
  return task;
}

function queueFilePath(): string {
  const engine = fmdEngine as unknown as { tasks: unknown[] };
  void engine;
  return path.join(dataDir, 'download-tasks.json');
}

test('shutdown with no in-flight work drains immediately and persists the queue', async () => {
  const result = await fmdEngine.shutdownAsync(1_000);
  assert.deepEqual(result, { drained: true, timedOut: false });
  assert.ok(fs.existsSync(queueFilePath()));
});

test('shutdownAsync pauses active tasks and enforces the deadline on hung workers', async () => {
  const task = seedDownloadingTask('hung-1');
  const engine = fmdEngine as unknown as {
    activeTaskPromises: Map<string, Promise<void>>;
  };
  // Simulate a worker that ignores its abort signal.
  engine.activeTaskPromises.set(task.id, new Promise<void>(() => {}));

  const started = Date.now();
  const result = await fmdEngine.shutdownAsync(250);
  const elapsed = Date.now() - started;

  assert.equal(result.timedOut, true);
  assert.equal(result.drained, false);
  assert.ok(elapsed >= 200, `shutdown returned before the deadline (${elapsed}ms)`);
  assert.ok(elapsed < 5_000, `shutdown waited far too long (${elapsed}ms)`);

  const persisted = JSON.parse(fs.readFileSync(queueFilePath(), 'utf-8')) as Array<{
    id: string;
    status: string;
  }>;
  const persistedTask = persisted.find((t) => t.id === 'hung-1');
  assert.ok(persistedTask);
  assert.equal(persistedTask.status, 'paused');
});

test('a completed task keeps its completed state across shutdown persistence', async () => {
  const engine = fmdEngine as unknown as { tasks: Array<Record<string, unknown>> };
  engine.tasks.push({
    id: 'done-1',
    mangaTitle: 'Shutdown Fixture Completed',
    format: 'CBZ',
    status: 'completed',
    sourceId: 'weebcentral',
    luaModule: 'WeebCentral.lua',
    totalPages: 4,
  });
  await fmdEngine.shutdownAsync(1_000);
  const persisted = JSON.parse(fs.readFileSync(queueFilePath(), 'utf-8')) as Array<{
    id: string;
    status: string;
  }>;
  assert.equal(persisted.find((t) => t.id === 'done-1')?.status, 'completed');
  assert.equal(persisted.find((t) => t.id === 'hung-1')?.status, 'paused');
});
