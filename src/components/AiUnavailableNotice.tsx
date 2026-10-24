import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

const DISMISS_KEY = 'fmd2-ai-notice-dismissed';

/**
 * COMPAT-03 (D-17): inline dismissible banner on the discovery views when AI
 * discovery is attempted without GEMINI_API_KEY. Copy names the key and never
 * references .env. Dismissal is session-scoped (sessionStorage — ephemeral UI
 * state, not the desktop prefs store per the Phase 1 prohibition).
 */
export const AiUnavailableNotice: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = (): void => {
      let dismissed = false;
      try {
        dismissed = sessionStorage.getItem(DISMISS_KEY) === '1';
      } catch {
        dismissed = false;
      }
      if (!dismissed) setVisible(true);
    };
    window.addEventListener('fmd2:ai-unavailable', handler);
    return () => window.removeEventListener('fmd2:ai-unavailable', handler);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 rounded-xl border border-violet-400/15 bg-violet-500/[0.07] px-4 py-3"
    >
      <div className="flex min-w-0 items-center gap-3">
        <Sparkles className="h-4 w-4 shrink-0 text-violet-300" />
        <p className="min-w-0 text-[12px] leading-relaxed text-violet-100/90">
          AI discovery needs <span className="font-mono font-semibold">GEMINI_API_KEY</span> — not
          configured in this build. Everything else works without it.
        </p>
      </div>
      <button
        type="button"
        aria-label="Dismiss AI availability notice"
        onClick={() => {
          try {
            sessionStorage.setItem(DISMISS_KEY, '1');
          } catch {
            // Session storage unavailable — dismiss for this render only
          }
          setVisible(false);
        }}
        className="rounded-lg px-3 py-2 text-[10px] font-bold text-violet-100/80 transition-colors hover:bg-violet-400/10 hover:text-violet-100"
      >
        Dismiss
      </button>
    </div>
  );
};
