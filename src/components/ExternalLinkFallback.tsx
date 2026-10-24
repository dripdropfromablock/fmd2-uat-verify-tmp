import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface ExternalLinkFailure {
  url: string;
  error?: string;
}

export const EXTERNAL_LINK_FAILURE_EVENT = 'fmd2:external-link-failed';

/**
 * Browser-handoff fallback (D-07): shown when the OS default browser could not
 * be opened for an external link. Copy per approved UI-SPEC — message, a
 * selectable read-only URL, and a copy button that reports success honestly.
 */
export const ExternalLinkFallback: React.FC = () => {
  const [failure, setFailure] = useState<ExternalLinkFailure | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handler = (event: Event): void => {
      const detail = (event as CustomEvent<ExternalLinkFailure>).detail;
      if (detail?.url) {
        setCopied(false);
        setFailure(detail);
      }
    };
    window.addEventListener(EXTERNAL_LINK_FAILURE_EVENT, handler);
    return () => window.removeEventListener(EXTERNAL_LINK_FAILURE_EVENT, handler);
  }, []);

  if (!failure) return null;

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(failure.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the input stays selectable for manual copy.
      setCopied(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) setFailure(null); }}>
      <DialogContent className="max-w-md bg-[#151C2A] border-white/[0.1] text-white">
        <DialogHeader>
          <DialogTitle className="font-display text-base font-semibold text-white">
            Your browser couldn't be opened
          </DialogTitle>
        </DialogHeader>
        {failure.error && (
          <p className="text-[12px] text-rose-300/90">{failure.error}</p>
        )}
        <Input
          readOnly
          value={failure.url}
          onFocus={(e) => e.currentTarget.select()}
          className="font-mono text-[12px] text-slate-300"
        />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => void handleCopy()}>
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
