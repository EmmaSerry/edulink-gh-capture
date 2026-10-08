import { useEffect, useState } from "react";
import "@/styles/install-button.css";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// The browser fires this once, early. Listen at module load (not inside
// the component) so it is never missed before the screen has mounted.
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

const DISMISS_KEY = "edulink-capture-install-dismissed";

function isInstalled(): boolean {
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches;
  const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return !!(standalone || iosStandalone);
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return at > 0 && Date.now() - at < 7 * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/** A floating "Install app" button. Installs in one tap where the browser
 *  allows it, otherwise shows the two-step instructions for the phone. */
export function InstallAppButton() {
  const [, bump] = useState(0);
  const [hidden, setHidden] = useState(() => isInstalled() || recentlyDismissed());
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const l = () => {
      if (isInstalled()) setHidden(true);
      bump((n) => n + 1);
    };
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  if (hidden) return null;

  async function handleInstall() {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      deferred = null;
      if (choice.outcome === "accepted") setHidden(true);
      bump((n) => n + 1);
      return;
    }
    setHelp(true);
  }

  function dismiss(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setHidden(true);
  }

  return (
    <>
      <button type="button" className="install-chip" onClick={() => void handleInstall()} aria-label="Install the EduLink Capture app">
        <span>⬇ Install app</span>
        <span className="install-x" role="button" aria-label="Hide" onClick={dismiss}>
          ✕
        </span>
      </button>

      {help && (
        <div className="install-sheet-backdrop" onClick={() => setHelp(false)}>
          <div className="install-sheet" onClick={(e) => e.stopPropagation()}>
            <h2>Install EduLink Capture</h2>
            {isIos() ? (
              <ol>
                <li>
                  Tap the <strong>Share</strong> button (the square with an arrow) at the bottom of Safari.
                </li>
                <li>
                  Scroll and tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
                </li>
              </ol>
            ) : (
              <ol>
                <li>
                  Tap the browser menu <strong>⋮</strong> (top right of Chrome).
                </li>
                <li>
                  Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>), then <strong>Install</strong>.
                </li>
              </ol>
            )}
            <p className="text-muted small mb-3">It then opens like any other app and works offline.</p>
            <button className="btn btn-primary w-100" onClick={() => setHelp(false)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
