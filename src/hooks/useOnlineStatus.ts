import { useEffect, useState } from "react";

/** Tracks the browser's own online/offline signal. Good enough for
 *  showing status and deciding when to fire a sync attempt - not a
 *  guarantee every request will succeed (a phone can report "online"
 *  while on a weak signal that still times out), which is exactly why
 *  SyncEngine treats every failure as retryable rather than fatal. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}
