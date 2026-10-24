import React, { useEffect, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

type CloseAction = 'quit' | 'tray';

const CAPTIONS: Record<CloseAction, string> = {
  quit: 'Quit FMD2 Studio',
  tray: 'Keep running in the system tray',
};

/**
 * Desktop close-behavior preference (D-04) per 01-UI-SPEC:
 * Label "When I close the window" + Switch; OFF (default) quits, ON hides to
 * the system tray. Renders only when the desktop bridge is present.
 */
export const DesktopSettingsSection: React.FC = () => {
  const [closeAction, setCloseAction] = useState<CloseAction>('quit');
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const bridge = window.fmd2Desktop?.prefs;
    if (!bridge) return;
    setIsDesktop(true);
    let cancelled = false;
    bridge
      .read()
      .then((prefs) => {
        if (!cancelled) setCloseAction(prefs.closeAction);
      })
      .catch(() => {
        // Read failure falls back to the default (quit) per UI-SPEC.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isDesktop) return null;

  const handleToggle = (checked: boolean) => {
    const next: CloseAction = checked ? 'tray' : 'quit';
    setCloseAction(next);
    void window.fmd2Desktop?.prefs?.write({ closeAction: next }).catch(() => {
      // Persist failure keeps the optimistic state; next launch reads the store.
    });
  };

  return (
    <section
      aria-label="Desktop settings"
      className="rounded-2xl border border-white/[0.07] bg-[#101118] p-4 sm:p-5"
    >
      <h2 className="font-display text-lg font-bold text-white">Desktop</h2>
      <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
        <div className="min-w-0">
          <Label className="text-[13px] font-semibold text-white/90">When I close the window</Label>
          <p className="mt-1 text-[12px] text-white/45">{CAPTIONS[closeAction]}</p>
        </div>
        <Switch
          checked={closeAction === 'tray'}
          onCheckedChange={handleToggle}
          aria-label="Keep FMD2 Studio running in the system tray when the window is closed"
        />
      </div>
    </section>
  );
};
