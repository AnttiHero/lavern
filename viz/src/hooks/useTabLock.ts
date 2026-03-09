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

    const channel = new BroadcastChannel(`marble-session-${sessionId}`);
    channelRef.current = channel;

    // Announce our presence
    channel.postMessage({ type: 'tab-open', tabId: tabId.current });

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
      channel.postMessage({ type: 'tab-close', tabId: tabId.current });
      channel.close();
      channelRef.current = null;
    };
  }, [sessionId]);

  return { isLocked };
}
