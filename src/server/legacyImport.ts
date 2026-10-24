/**
 * Legacy `.fmd2-data` import engine (DATA-03/04, D-05..D-12).
 *
 * Pure functions with an injected fs-like interface — unit-testable under tsx
 * without Electron or real disk. The Electron layer (electron/legacyImport.ts)
 * wraps these with the real fs, the directory dialog, and the IPC bridge.
 *
 * Validation mirrors fmdEngine.loadDownloadTasksFromDisk's record checks exactly
 * (id/mangaTitle strings + isArchiveFormat(format)) so imported records are
 * accepted by the engine's own load path. Archive placement is name-based: the
 * engine recomputes savePath at load via getDiskFilePath's naming convention,
 * which this module mirrors for existence checks.
 */

export interface LegacyTaskRecord {
  id: string;
  mangaId: string;
  mangaTitle: string;
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  sourceId: string;
  luaModule: string;
  format: string;
  status: string;
  [key: string]: unknown;
}

export interface FsLike {
  existsSync(path: string): boolean;
  readFileSync(path: string): Buffer | string;
  readdirSync(path: string): string[];
  writeFileSync(path: string, data: string): void;
  renameSync(oldPath: string, newPath: string): void;
  mkdirSync(path: string, opts?: { recursive?: boolean }): void;
  copyFileSync(src: string, dest: string): void;
  statSync(path: string): { isFile(): boolean };
}

export function createMemoryFs(files: Record<string, string>): FsLike {
  const store = new Map(Object.entries(files));
  const dir = (p: string): string[] => {
    const prefix = p.replace(/\/+$/, '') + '/';
    const names: string[] = [];
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) {
        const rest = key.slice(prefix.length);
        names.push(rest.includes('/') ? rest.split('/')[0] : rest);
      }
    }
    return names;
  };
  return {
    existsSync: (p) => store.has(p) || dir(p).length > 0,
    readFileSync: (p) => store.get(p) ?? '',
    readdirSync: (p) => dir(p),
    writeFileSync: (p, data) => void store.set(p, String(data)),
    renameSync: (a, b) => {
      const v = store.get(a);
      store.delete(a);
      if (v !== undefined) store.set(b, v);
    },
    mkdirSync: () => {},
    copyFileSync: (src, dest) => {
      const v = store.get(src);
      if (v !== undefined) store.set(dest, v);
    },
    statSync: (p) => ({ isFile: () => store.has(p) }),
  };
}

export interface ImportRecord {
  record: LegacyTaskRecord;
  archiveFileName: string;
  archiveExistsInLegacy: boolean;
}

export interface ImportReport {
  total: number;
  found: ImportRecord[];
  missing: ImportRecord[];
  unsupported: unknown[];
  skippedFiles: string[];
  hasCloudSyncStore: boolean;
}

const ARCHIVE_NAME_RE = /[^a-zA-Z0-9_-]+/g;

/** Mirrors fmdEngine.getDiskFilePath's naming convention (name-based placement, D-11). */
export function computeLegacyArchiveFileName(record: {
  mangaId: string;
  sourceId: string;
  mangaTitle: string;
  chapterNumber: number;
  format: string;
}): string {
  const ext = String(record.format).toLowerCase();
  const safeSeries = `${record.mangaId}_${record.sourceId}_${record.mangaTitle}`
    .replace(ARCHIVE_NAME_RE, '_')
    .slice(0, 120);
  return `${safeSeries}_Ch_${String(record.chapterNumber).padStart(3, '0')}.${ext}`;
}

function isValidRecord(task: unknown): task is LegacyTaskRecord {
  return (
    Boolean(task) &&
    typeof task === 'object' &&
    typeof (task as LegacyTaskRecord).id === 'string' &&
    typeof (task as LegacyTaskRecord).mangaTitle === 'string' &&
    typeof (task as LegacyTaskRecord).mangaId === 'string' &&
    typeof (task as LegacyTaskRecord).chapterNumber === 'number' &&
    typeof (task as LegacyTaskRecord).format === 'string' &&
    /^(cbz|zip|pdf|epub)$/i.test(String((task as LegacyTaskRecord).format))
  );
}

/** Pre-flight scan (D-06): validates + classifies without copying anything. */
export function scanLegacyFolder(root: string, fs: FsLike): ImportReport {
  const report: ImportReport = {
    total: 0,
    found: [],
    missing: [],
    unsupported: [],
    skippedFiles: [],
    hasCloudSyncStore: false,
  };

  const storePath = `${root}/download-tasks.json`;
  if (!fs.existsSync(storePath)) {
    return report;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(String(fs.readFileSync(storePath)));
  } catch {
    return report; // malformed store — zero records, no throw (D-08)
  }
  if (!Array.isArray(parsed)) return report;

  report.hasCloudSyncStore = fs.existsSync(`${root}/cloud-sync-store.json`);

  const downloadsDir = `${root}/downloads`;
  const referencedNames = new Set<string>();

  for (const task of parsed) {
    report.total++;
    if (!isValidRecord(task)) {
      report.unsupported.push(task);
      continue;
    }
    const archiveFileName = computeLegacyArchiveFileName(task);
    referencedNames.add(archiveFileName);
    const archivePath = `${downloadsDir}/${archiveFileName}`;
    const record: ImportRecord = {
      record: task,
      archiveFileName,
      archiveExistsInLegacy: task.status === 'completed' && fs.existsSync(archivePath),
    };
    if (record.archiveExistsInLegacy || task.status !== 'completed') {
      report.found.push(record);
    } else {
      // completed status but the archive file is absent — DATA-04 missing reference
      report.missing.push(record);
    }
  }

  if (fs.existsSync(downloadsDir)) {
    for (const name of fs.readdirSync(downloadsDir)) {
      if (!referencedNames.has(name)) {
        report.skippedFiles.push(name);
      }
    }
  }

  return report;
}

export interface MergePlan<T> {
  toAdd: T[];
  keptCount: number;
  archivesAlreadyPresent: string[];
}

/** Merge by task id (D-09): existing records kept, new records added. */
export function buildMergePlan<T extends { id: string }>(
  existing: T[],
  imported: T[],
  destination?: {
    archiveExists: (name: string) => boolean;
    archiveNames: () => string[];
  }
): MergePlan<T> {
  const existingIds = new Set(existing.map((t) => t.id));
  const toAdd = imported.filter((t) => !existingIds.has(t.id));
  const plan: MergePlan<T> = {
    toAdd,
    keptCount: existing.length,
    archivesAlreadyPresent: [],
  };
  if (destination) {
    const present = new Set(destination.archiveNames());
    for (const name of present) {
      if (destination.archiveExists(name)) plan.archivesAlreadyPresent.push(name);
    }
  }
  return plan;
}
