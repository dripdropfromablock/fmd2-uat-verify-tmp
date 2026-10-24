import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleSlash,
  FolderOpen,
} from 'lucide-react';

interface ImportRecord {
  record: { id: string; mangaTitle: string; chapterNumber: number; format: string };
  archiveFileName: string;
  archiveExistsInLegacy: boolean;
}

interface ImportReport {
  total: number;
  found: ImportRecord[];
  missing: ImportRecord[];
  unsupported: unknown[];
  skippedFiles: string[];
  hasCloudSyncStore: boolean;
}

interface ImportResult {
  importedCount: number;
  flaggedCount: number;
  unsupportedCount?: number;
  skippedCount: number;
  failures?: string[];
  missingCount?: number;
}

type ImportState =
  | { phase: 'idle' }
  | { phase: 'report'; folder: string; report: ImportReport }
  | { phase: 'importing'; folder: string }
  | { phase: 'result'; result: ImportResult };

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="rounded-2xl border border-white/[0.07] bg-[#101118] p-4 sm:p-5"
    >
      <h2 className="font-display text-lg font-bold text-white">{title}</h2>
      {children}
    </section>
  );
}

function ReportGroup({
  icon,
  label,
  count,
  rows,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  rows: string[];
  tone: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (count === 0) return null;
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02]">
      <button
        type="button"
        onClick={() => rows.length > 0 && setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 p-3 text-left"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2">
          {icon}
          <span className={`text-[12px] font-semibold ${tone}`}>{label}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-[12px] tabular-nums text-white/60">{count}</span>
          {rows.length > 0 && (
            expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-white/40" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-white/40" />
            )
          )}
        </span>
      </button>
      {expanded && rows.length > 0 && (
        <ul className="border-t border-white/[0.05] px-3 py-2">
          {rows.map((row, i) => (
            <li key={i} className="truncate py-0.5 text-[12px] text-white/55" title={row}>
              {row}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Import legacy data section (DATA-03/04) per 02-UI-SPEC:
 * idle → report → importing → result, all inside one card. The renderer drives
 * the fmd2Desktop.import bridge; validation and copy are main-process.
 */
export const ImportLegacyDataSection: React.FC = () => {
  const [isDesktop, setIsDesktop] = useState(false);
  const [state, setState] = useState<ImportState>({ phase: 'idle' });
  const [busy, setBusy] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (window.fmd2Desktop?.import) setIsDesktop(true);
  }, []);

  if (!isDesktop) return null;

  const handleChooseFolder = async (): Promise<void> => {
    const bridge = window.fmd2Desktop?.import;
    if (!bridge || busy) return;
    setBusy(true);
    try {
      const pick = await bridge.pickFolder();
      if (!pick.ok || !pick.folder) return;
      const pre = await bridge.preflight(pick.folder);
      if (pre.error || !pre.report) return;
      setState({ phase: 'report', folder: pick.folder, report: pre.report });
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmImport = async (): Promise<void> => {
    const bridge = window.fmd2Desktop?.import;
    if (!bridge || stateRef.current.phase !== 'report') return;
    setState({ phase: 'importing', folder: stateRef.current.folder });
    const result = await bridge.execute(stateRef.current.folder);
    if (result.error) {
      setState({ phase: 'idle' });
      return;
    }
    setState({
      phase: 'result',
      result: {
        importedCount: result.importedCount ?? 0,
        flaggedCount: result.flaggedCount ?? 0,
        unsupportedCount: result.unsupportedCount ?? 0,
        skippedCount: result.skippedCount ?? 0,
        failures: result.failures,
        missingCount: result.missingCount,
      },
    });
  };

  return (
    <SectionCard title="Import legacy data">
      {state.phase === 'idle' && (
        <div className="mt-3 flex items-center justify-between gap-4">
          <p className="text-[13px] leading-relaxed text-white/60">
            Bring data from a previous <span className="font-mono">.fmd2-data</span> folder into
            this app. The original folder is never modified.
          </p>
          <Button onClick={() => void handleChooseFolder()} disabled={busy}>
            <FolderOpen className="mr-1.5 h-4 w-4" />
            Choose folder…
          </Button>
        </div>
      )}

      {state.phase === 'report' && (
        <div className="mt-3 space-y-2">
          <Label className="text-[12px] text-white/50">
            Import preview · {state.report.total} records ·{' '}
            {state.report.found.length + state.report.missing.length} importable
          </Label>
          <div className="space-y-2">
            <ReportGroup
              icon={<CheckCircle2 className="h-4 w-4 text-teal-300" />}
              label="Ready to import"
              count={state.report.found.length}
              rows={state.report.found.map(
                (r) => `${r.record.mangaTitle} Ch. ${r.record.chapterNumber} · ${r.archiveFileName}`
              )}
              tone="text-teal-200"
            />
            <ReportGroup
              icon={<AlertTriangle className="h-4 w-4 text-amber-300" />}
              label="Missing archives"
              count={state.report.missing.length}
              rows={state.report.missing.map(
                (r) => `${r.record.mangaTitle} Ch. ${r.record.chapterNumber} · ${r.archiveFileName}`
              )}
              tone="text-amber-200"
            />
            <ReportGroup
              icon={<CircleSlash className="h-4 w-4 text-rose-300" />}
              label="Unsupported records"
              count={state.report.unsupported.length}
              rows={state.report.unsupported.map((u) => JSON.stringify(u).slice(0, 120))}
              tone="text-rose-200"
            />
            <ReportGroup
              icon={<CircleSlash className="h-4 w-4 text-white/40" />}
              label="Skipped files"
              count={state.report.skippedFiles.length}
              rows={state.report.skippedFiles}
              tone="text-white/50"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" disabled={busy} onClick={() => setState({ phase: 'idle' })}>
              Cancel
            </Button>
            <Button
              disabled={busy || state.report.found.length + state.report.missing.length === 0}
              onClick={() => void handleConfirmImport()}
            >
              Confirm import
            </Button>
          </div>
        </div>
      )}

      {state.phase === 'importing' && (
        <div className="mt-3 space-y-2" aria-live="polite">
          <div
            className="h-2 overflow-hidden rounded-full bg-white/[0.08]"
            role="progressbar"
            aria-label="Importing legacy data"
          >
            <div
              className="h-full w-2/5 rounded-full bg-[#6366F1]"
              style={{ animation: 'splash-sweep 1.1s cubic-bezier(0.45,0,0.55,1) infinite' }}
            />
          </div>
          <p className="text-[12px] text-white/50">Copying legacy data…</p>
        </div>
      )}

      {state.phase === 'result' && (
        <div className="mt-3 space-y-2" aria-live="polite">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-teal-300" />
            <p className="text-[13px] font-semibold text-white">
              Imported {state.result.importedCount} · Flagged {state.result.flaggedCount} ·
              Skipped {state.result.skippedCount}
            </p>
          </div>
          {state.result.failures && state.result.failures.length > 0 && (
            <ul className="space-y-1">
              {state.result.failures.map((f, i) => (
                <li key={i} className="truncate text-[12px] text-rose-300/80" title={f}>
                  {f}
                </li>
              ))}
            </ul>
          )}
          <Button variant="outline" onClick={() => setState({ phase: 'idle' })}>
            Done
          </Button>
        </div>
      )}
    </SectionCard>
  );
};
