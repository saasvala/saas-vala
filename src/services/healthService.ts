import { systemHealthApi } from '@/lib/api';

const HEALTH_POLL_INTERVAL_MS = 5000;

type HealthUpdateListener = (payload: unknown) => void;
type HealthErrorListener = (error: unknown) => void;

export function healthService(pollIntervalMs = HEALTH_POLL_INTERVAL_MS) {
  let timer: number | null = null;
  let inFlight = false;
  const updateListeners = new Set<HealthUpdateListener>();
  const errorListeners = new Set<HealthErrorListener>();

  const notifyUpdate = (payload: unknown) => {
    updateListeners.forEach((listener) => listener(payload));
  };

  const notifyError = (error: unknown) => {
    errorListeners.forEach((listener) => listener(error));
  };

  const poll = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const snapshot = await systemHealthApi.get();
      notifyUpdate(snapshot);
    } catch (error) {
      notifyError(error);
    } finally {
      inFlight = false;
    }
  };

  return {
    start() {
      this.stop();
      void poll();
      timer = window.setInterval(() => {
        void poll();
      }, pollIntervalMs);
    },
    stop() {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    },
    async runCheck() {
      try {
        const snapshot = await systemHealthApi.runCheck();
        notifyUpdate(snapshot);
        return snapshot;
      } catch (error) {
        notifyError(error);
        throw error;
      }
    },
    onUpdate(listener: HealthUpdateListener) {
      updateListeners.add(listener);
      return () => updateListeners.delete(listener);
    },
    onError(listener: HealthErrorListener) {
      errorListeners.add(listener);
      return () => errorListeners.delete(listener);
    },
  };
}
