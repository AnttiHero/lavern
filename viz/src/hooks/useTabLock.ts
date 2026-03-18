/**
 * useTabLock — Prevents duplicate tabs from connecting to the same session.
 * Uses BroadcastChannel API to coordinate across tabs.
 */
import { useEffect, useRef, useState } from 'react';

export function useTabLock(sessionId: string | undefined): { isLocked: boolean } {
  const [isLocked, setIsLocked] = useState(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const tabId = useRef(`tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);

  useEffect(() => {
    if (!sessionId) { setIsLocked(false); return; }

    // BroadcastChannel not available in Safari < 15.4 and some WebViews — fail gracefully
    if (typeof BroadcastChannel === 'undefined') return;

    let channel: BroadcastChannel;
    try {
      channel = new BroadcastChannel(`lavern-session-${sessionId}`);
    } catch {
      // BroadcastChannel constructor can throw in restricted contexts — skip tab locking
      return;
    }
    channelRef.current = channel;

    // Announce our presence — may fail if channel was closed between creation and here
    try { channel.postMessage({ type: 'tab-open', tabId: tabId.current }); } catch { /* ignore */ }

    channel.onmessage = (e) => {
      if (e.data.type === 'tab-open' && e.data.tabId !== tabId.current) {
        // Another tab opened the same session — the OLDER tab keeps it
        // We are the newer tab, so we lock ourselves
        setIsLocked(true);
      }
      if (e.data.type === 'tab-close' && e.data.tabId !== tabId.current) {
        // The other tab closed — we can take over
        setIsLocked(false);
      }
    };

    return () => {
      try { channel.postMessage({ type: 'tab-close', tabId: tabId.current }); } catch { /* ignore */ }
      try { channel.close(); } catch { /* ignore */ }
      channelRef.current = null;
    };
  }, [sessionId]);

  return { isLocked };
}
