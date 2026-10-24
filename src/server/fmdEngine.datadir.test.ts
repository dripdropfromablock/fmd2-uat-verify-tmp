import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

// DATA-01/02: engine resolves data + archive defaults from the desktop env seams.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fmd2-datadir-'));
const archiveDir = path.join(dataDir, 'downloads-override');
process.env.FMD_DATA_DIR = dataDir;
process.env.FMD_DOWNLOAD_DIR = archiveDir;

const { fmdEngine } = await import('./fmdEngine.ts');

test('engine saveDirectory default resolves from FMD_DOWNLOAD_DIR when set', () => {
  const state = fmdEngine.getState();
  assert.equal(state.config.saveDirectory, archiveDir);
});

test('engine data store files land under FMD_DATA_DIR', () => {
  // ensureDownloadDir() creates the downloads dir under DATA_ROOT at construction;
  // store JSON files appear on first persist, not on load.
  assert.ok(fs.existsSync(path.join(dataDir, 'downloads')));
});

test('archive disk path honors the configured save directory (DATA-01)', () => {
  const engine = fmdEngine as unknown as {
    getDiskFilePath(task: { mangaId: string; sourceId: string; mangaTitle: string; chapterNumber: number; format: string }): string;
  };
  const p = engine.getDiskFilePath({
    mangaId: 'as-x',
    sourceId: 'asurascans',
    mangaTitle: 'T',
    chapterNumber: 3,
    format: 'CBZ',
  });
  assert.ok(p.startsWith(archiveDir), `archive path ${p} should live under ${archiveDir}`);
});
