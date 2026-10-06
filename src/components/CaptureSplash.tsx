import { useEffect, useState } from "react";

const KEY = "edulink-capture-splash-seen";

/** A short animated welcome shown once each time the app is opened. Tap to skip. */
export function CaptureSplash() {
  const [gone, setGone] = useState(() => {
    try {
      return sessionStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });
  const [logoOk, setLogoOk] = useState(true);

  useEffect(() => {
    if (gone) return;
    const t = window.setTimeout(() => finish(), 3000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gone]);

  function finish() {
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {
      /* private mode - the splash simply shows again next time */
    }
    setGone(true);
  }

  if (gone) return null;

  return (
    <div className="capture-splash" onClick={finish} role="presentation">
      <div className="capture-splash-logo-wrap">
        <span className="capture-splash-ring" />
        <span className="capture-splash-ring" />
        <span className="capture-splash-ring" />
        {logoOk ? (
          <img src="/edulink-logo.png" alt="EduLink GH" onError={() => setLogoOk(false)} />
        ) : (
          <div className="capture-splash-fallback">EG</div>
        )}
      </div>
      <div className="capture-splash-title">EduLink GH Capture</div>
      <div className="capture-splash-sub">Capture anywhere. Sync when you can.</div>
      <div className="capture-splash-dots">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}
