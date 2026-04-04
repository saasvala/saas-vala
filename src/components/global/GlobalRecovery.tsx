import React, { useEffect } from 'react';

declare global {
  interface Window {
    _lastRender?: number;
    _recoveryReloadQueued?: boolean;
  }
}

function queueRecoveryReload() {
  if (window._recoveryReloadQueued) return;
  window._recoveryReloadQueued = true;
  document.body.innerHTML = 'System Recovering...';
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
    const previousOnError = window.onerror;
    const previousOnUnhandledRejection = window.onunhandledrejection;

    window.onerror = function (...args) {
      queueRecoveryReload();
      if (typeof previousOnError === 'function') {
        return previousOnError(...args);
      }
      return false;
    };

    window.onunhandledrejection = function (event) {
      queueRecoveryReload();
      if (typeof previousOnUnhandledRejection === 'function') {
        return previousOnUnhandledRejection(event);
      }
      return true;
    };

    const intervalId = window.setInterval(() => {
      const lastRender = window._lastRender ?? performance.now();
      const stuck = performance.now() - lastRender > 5000;
      if (stuck) {
        console.warn('UI FREEZE DETECTED');
        queueRecoveryReload();
      }
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
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
  private recoverTimer: number | null = null;

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
