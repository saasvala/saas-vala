import React, { useEffect } from 'react';

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
  }, 1500);
}

function markRender() {
  window._lastRender = performance.now();
}

export function GlobalRecovery() {
  useEffect(() => {
    markRender();
  });

  useEffect(() => {
    window._lastRender = performance.now();
    const previousOnError = window.onerror;
    const previousOnUnhandledRejection = window.onunhandledrejection;

    window.onerror = function (...args) {
      let previousResult = false;
      if (typeof previousOnError === 'function') {
        previousResult = previousOnError(...args);
      }
      queueRecoveryReload();
      return previousResult;
    };

    window.onunhandledrejection = function (event) {
      const previousResult =
        typeof previousOnUnhandledRejection === 'function'
          ? previousOnUnhandledRejection(event)
          : true;
      queueRecoveryReload();
      return previousResult;
    };

    window._recoveryWatchdogId = window.setInterval(() => {
      const lastRender = window._lastRender ?? performance.now();
      const stuck = performance.now() - lastRender > 5000;
      if (stuck) {
        console.warn('UI FREEZE DETECTED');
        queueRecoveryReload();
      }
    }, 3000);

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
    }, 1500);
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
