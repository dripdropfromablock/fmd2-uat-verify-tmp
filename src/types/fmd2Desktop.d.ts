// Typed desktop bridge surfaced by electron/preload.cjs. Absent in browser dev.
declare global {
  interface Window {
    fmd2Desktop?: {
      onLifecycleStatus?: (callback: (status: string) => void) => void;
      prefs?: {
        read: () => Promise<{ closeAction: 'quit' | 'tray' }>;
        write: (patch: { closeAction: 'quit' | 'tray' }) => Promise<{ closeAction: 'quit' | 'tray' }>;
      };
      recovery?: {
        retry: () => Promise<{ ok: boolean }>;
        openLogFolder: () => Promise<{ ok: boolean; error?: string }>;
        getLogPath: () => Promise<string>;
      };
      import?: {
        pickFolder: () => Promise<{ ok: boolean; folder: string | null; error?: string }>;
        preflight: (folder: string) => Promise<{ ok?: boolean; report?: import("../server/legacyImport").ImportReport; error?: string }>;
        execute: (folder: string) => Promise<{ ok?: boolean; importedCount?: number; flaggedCount?: number; unsupportedCount?: number; skippedCount?: number; failures?: string[]; missingCount?: number; error?: string }>;
      };
      links?: {
        openExternal: (url: string) => Promise<{ ok: boolean; error?: string }>;
      };
    };
  }
}

export {};
