export type QuickActionEventType =
  | 'product_added'
  | 'key_generated'
  | 'apk_uploaded'
  | 'server_deployed'
  | 'credits_added';

import { supabase } from '@/integrations/supabase/client';

const QUICK_ACTION_EVENT = 'saasvala:quick-action-event';
const QUICK_ACTION_CHANNEL = 'quick-actions-live';
let activeListeners = 0;
let initialized = false;
let cleanup: (() => void) | null = null;
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

function ensureRealtimeBridge() {
  if (initialized) return;
  const channel = supabase
    .channel(QUICK_ACTION_CHANNEL)
    .on('broadcast', { event: 'quick_action' }, ({ payload }) => {
      const type = payload?.type as QuickActionEventType | undefined;
      if (!type) return;
      window.dispatchEvent(new CustomEvent<QuickActionEventType>(QUICK_ACTION_EVENT, { detail: type }));
    })
    .subscribe();

  realtimeChannel = channel;
  cleanup = () => {
    supabase.removeChannel(channel);
    realtimeChannel = null;
    initialized = false;
    cleanup = null;
  };
  initialized = true;
}

export function emitQuickActionEvent(type: QuickActionEventType) {
  ensureRealtimeBridge();
  window.dispatchEvent(new CustomEvent<QuickActionEventType>(QUICK_ACTION_EVENT, { detail: type }));
  if (!realtimeChannel) return;
  void realtimeChannel.send({
    type: 'broadcast',
    event: 'quick_action',
    payload: { type },
  });
}

export function subscribeQuickActionEvents(handler: (event: QuickActionEventType) => void) {
  ensureRealtimeBridge();
  activeListeners += 1;
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<QuickActionEventType>).detail;
    if (!detail) return;
    handler(detail);
  };
  window.addEventListener(QUICK_ACTION_EVENT, listener as EventListener);
  return () => {
    window.removeEventListener(QUICK_ACTION_EVENT, listener as EventListener);
    activeListeners = Math.max(0, activeListeners - 1);
    if (activeListeners === 0 && cleanup) cleanup();
  };
}
