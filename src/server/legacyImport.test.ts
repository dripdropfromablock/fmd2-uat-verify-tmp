import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scanLegacyFolder,
  buildMergePlan,
  createMemoryFs,
  computeLegacyArchiveFileName,
} from './legacyImport.ts';

const VALID_RECORD = {
  id: 'dl-1',
  mangaId: 'wc-abc',
  mangaTitle: 'Solo Leveling',
  chapterId: 'ch-1',
  chapterNumber: 1,
  chapterTitle: 'Ch 1',
  sourceId: 'weebcentral',
  luaModule: 'WeebCentral.lua',
  format: 'CBZ',
  status: 'completed',
  progress: 100,
  pagesDownloaded: 49,
  totalPages: 49,
  speedKbps: 0,
  sizeMb: 12,
  addedAt: '2026-10-24T00:00:00Z',
  savePath: 'X:\\old\\.fmd2-data\\downloads\\wc-abc_weebcentral_Solo_Leveling_Ch_001.CBZ',
};

function fixtureRoot(overrides: {
  records?: unknown[];
  archiveNames?: string[];
  cloudSync?: boolean;
  malformed?: boolean;
  orphan?: string;
}) {
  const downloads: Record<string, string> = {};
  for (const name of overrides.archiveNames ?? []) downloads[name] = 'archive-bytes';
  if (overrides.orphan) downloads[overrides.orphan] = 'orphan-bytes';
  return createMemoryFs({
    'legacy/download-tasks.json': overrides.malformed
      ? '{ not json'
      : JSON.stringify(overrides.records ?? []),
    'legacy/cloud-sync-store.json': overrides.cloudSync === false ? '' : '{}',
    ...Object.fromEntries(
      Object.entries(downloads).map(([name, content]) => [`legacy/downloads/${name}`, content])
    ),
  });
}

test('scan classifies found / missing / unsupported against the legacy root', () => {
  const completedWithArchive = { ...VALID_RECORD, id: 'dl-1' };
  const completedNoArchive = {
    ...VALID_RECORD,
    id: 'dl-2',
    chapterNumber: 2,
    status: 'completed',
  };
  const queued = { ...VALID_RECORD, id: 'dl-3', chapterNumber: 3, status: 'queued' };
  const unsupported = { id: 42, note: 'not a task' };
  const archiveName = computeLegacyArchiveFileName(completedWithArchive);
  const fs = fixtureRoot({
    records: [completedWithArchive, completedNoArchive, queued, unsupported],
    archiveNames: [archiveName],
  });

  const report = scanLegacyFolder('legacy', fs);

  assert.equal(report.total, 4);
  assert.deepEqual(report.found.map((r) => r.record.id).sort(), ['dl-1', 'dl-3']);
  assert.deepEqual(report.missing.map((r) => r.record.id), ['dl-2']);
  assert.equal(report.unsupported.length, 1);
  assert.ok(report.skippedFiles.includes('cloud-sync-store.json') === false);
});

test('cloud-sync-store.json presence is reported, not treated as a skipped unknown', () => {
  const fs = fixtureRoot({ records: [], cloudSync: true });
  const report = scanLegacyFolder('legacy', fs);
  assert.equal(report.hasCloudSyncStore, true);
});

test('malformed download-tasks.json yields zero records without throwing', () => {
  const fs = fixtureRoot({ malformed: true });
  const report = scanLegacyFolder('legacy', fs);
  assert.equal(report.total, 0);
  assert.deepEqual(report.found, []);
  assert.deepEqual(report.missing, []);
});

test('orphan files in the legacy downloads dir are listed as skipped', () => {
  const fs = fixtureRoot({ records: [], orphan: 'not-a-record.cbz' });
  const report = scanLegacyFolder('legacy', fs);
  assert.deepEqual(report.skippedFiles, ['not-a-record.cbz']);
});

test('buildMergePlan keeps existing ids, adds new ids, and skips archives already present', () => {
  const existing = [{ id: 'dl-1', title: 'kept' }];
  const imported = [
    { id: 'dl-1', title: 'duplicate' },
    { id: 'dl-2', title: 'new' },
  ];
  const plan = buildMergePlan(existing, imported);
  assert.deepEqual(
    plan.toAdd.map((r) => r.id),
    ['dl-2']
  );
  assert.equal(plan.keptCount, 1);
  assert.deepEqual(plan.archivesAlreadyPresent, []);
});

test('buildMergePlan skips archives whose destination file already exists', () => {
  const plan = buildMergePlan([], [{ id: 'dl-2' }], {
    archiveExists: (name: string) => name === 'known.cbz',
    archiveNames: () => ['known.cbz'],
  });
  assert.deepEqual(plan.archivesAlreadyPresent, ['known.cbz']);
});
