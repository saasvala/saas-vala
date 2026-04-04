import React, { useEffect } from 'react';

const RECOVERY_DELAY_MS = 1500;
const FREEZE_THRESHOLD_MS = 5000;
const WATCHDOG_INTERVAL_MS = 3000;

declare global {
  interface Window {
    _lastRender?: number;
    _recoveryReloadQueued?: boolean;
    _recoveryWatchdogId?: number;
  }
}

function showRecoveryMessage() {
  const id = 'sv-global-recovery-overlay';
  if (document.getElementById(id)) return;
  const overlay = document.createElement('div');
  overlay.id = id;
  overlay.setAttribute('role', 'alert');
  overlay.textContent = 'System Recovering...';
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.zIndex = '2147483647';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.background = 'rgba(0,0,0,0.92)';
  overlay.style.color = '#fff';
  overlay.style.fontSize = '20px';
  overlay.style.fontWeight = '600';
  document.body.appendChild(overlay);
}

function queueRecoveryReload() {
  if (window._recoveryReloadQueued) return;
  window._recoveryReloadQueued = true;
  if (typeof window._recoveryWatchdogId === 'number') {
    window.clearInterval(window._recoveryWatchdogId);
    window._recoveryWatchdogId = undefined;
  }
  showRecoveryMessage();
  window.setTimeout(() => {
    window.location.reload();
  }, RECOVERY_DELAY_MS);
}

export function GlobalRecovery() {
  useEffect(() => {
    if (typeof window._lastRender !== 'number') {
      window._lastRender = performance.now();
    }
    const previousOnError = window.onerror;
    const previousOnUnhandledRejection = window.onunhandledrejection;

    window.onerror = function (...args) {
      let previousResult = false;
      if (typeof previousOnError === 'function') {
        previousResult = previousOnError(...args);
      }
      if (!previousResult) queueRecoveryReload();
      return previousResult;
    };

    window.onunhandledrejection = function (event) {
      const previousResult =
        typeof previousOnUnhandledRejection === 'function'
          ? previousOnUnhandledRejection(event)
          : undefined;
      const handledByPrevious = previousResult === true;
      const shouldRecover = !handledByPrevious && !event.defaultPrevented;
      if (shouldRecover) queueRecoveryReload();
      return previousResult;
    };

    window._recoveryWatchdogId = window.setInterval(() => {
      const lastRender = window._lastRender ?? performance.now();
      const stuck = performance.now() - lastRender > FREEZE_THRESHOLD_MS;
      if (stuck) {
        console.warn('UI FREEZE DETECTED');
        queueRecoveryReload();
      }
    }, WATCHDOG_INTERVAL_MS);

    return () => {
      if (typeof window._recoveryWatchdogId === 'number') {
        window.clearInterval(window._recoveryWatchdogId);
        window._recoveryWatchdogId = undefined;
      }
      window.onerror = previousOnError;
      window.onunhandledrejection = previousOnUnhandledRejection;
    };
  }, []);

  return null;
}

type AppErrorBoundaryState = {
  hasError: boolean;
};

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  private recoverTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    if (this.recoverTimer !== null) return;
    this.recoverTimer = window.setTimeout(() => {
      queueRecoveryReload();
    }, RECOVERY_DELAY_MS);
  }

  componentWillUnmount() {
    if (this.recoverTimer !== null) {
      window.clearTimeout(this.recoverTimer);
      this.recoverTimer = null;
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          System Recovering...
        </div>
      );
    }
    return this.props.children;
  }
}
