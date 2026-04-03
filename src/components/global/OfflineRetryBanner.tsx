import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function OfflineRetryBanner() {
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (!offline) return null;

  const onRetry = async () => {
    setRetrying(true);
    try {
      const res = await fetch('/auth', { method: 'HEAD', cache: 'no-store' });
      if (res.ok) {
        setOffline(false);
        window.location.reload();
      }
    } catch {
      // still offline
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[70] rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 backdrop-blur">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-4 w-4 text-yellow-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-yellow-300">You are offline</p>
          <p className="text-xs text-yellow-200/90">Network is unavailable. Retry when connection is back.</p>
        </div>
        <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
          {retrying ? 'Retrying...' : 'Retry'}
        </Button>
      </div>
    </div>
  );
}
