import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { emitQuickActionEvent, type QuickActionEventType } from '@/lib/quickActionEvents';

export type QuickActionState = 'idle' | 'loading' | 'success';

type QuickActionRole = 'admin' | 'super_admin' | 'reseller' | 'user';

type HandleQuickActionConfig = {
  key: string;
  eventType: QuickActionEventType;
  validate?: () => string | null;
  action: () => Promise<unknown>;
  onBeforeAction?: () => void;
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
  role?: QuickActionRole;
  retryLabel?: string;
};

const RESET_DELAY_MS = 2000;
const MAX_RETRY_CLICKS = 3;

function getErrorMessage(error: unknown, fallback = 'Action failed'): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

export function useQuickActionEngine() {
  const { user, isSuperAdmin, isReseller } = useAuth();
  const [actionStates, setActionStates] = useState<Record<string, QuickActionState>>({});
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastConfigsRef = useRef<Record<string, HandleQuickActionConfig>>({});
  const retryCountRef = useRef<Record<string, number>>({});
  const inFlightRef = useRef<Record<string, boolean>>({});

  const isRoleAllowed = useCallback((required?: QuickActionRole) => {
    if (!required) return !!user;
    if (!user) return false;
    if (required === 'super_admin' || required === 'admin') return isSuperAdmin;
    if (required === 'reseller') return isReseller || isSuperAdmin;
    return true;
  }, [isReseller, isSuperAdmin, user]);

  const resetActionState = useCallback((key: string) => {
    if (timersRef.current[key]) clearTimeout(timersRef.current[key]);
    timersRef.current[key] = setTimeout(() => {
      setActionStates((prev) => ({ ...prev, [key]: 'idle' }));
      delete timersRef.current[key];
    }, RESET_DELAY_MS);
  }, []);

  const handleQuickAction = useCallback(async (config: HandleQuickActionConfig) => {
    lastConfigsRef.current[config.key] = config;
    if (inFlightRef.current[config.key]) return false;

    if (!isRoleAllowed(config.role)) {
      toast.error('Access denied');
      return false;
    }

    if (config.validate) {
      const validationError = config.validate();
      if (validationError) {
        toast.error(validationError);
        return false;
      }
    }

    setActionStates((prev) => ({ ...prev, [config.key]: 'loading' }));
    inFlightRef.current[config.key] = true;
    config.onBeforeAction?.();

    try {
      await config.action();
      retryCountRef.current[config.key] = 0;
      setActionStates((prev) => ({ ...prev, [config.key]: 'success' }));
      emitQuickActionEvent(config.eventType);
      config.onSuccess?.();
      resetActionState(config.key);
      return true;
    } catch (error) {
      setActionStates((prev) => ({ ...prev, [config.key]: 'idle' }));
      config.onError?.(error);
      const message = getErrorMessage(error);
      toast.error(message, {
        action: {
          label: config.retryLabel || 'Retry',
          onClick: () => {
            const retries = retryCountRef.current[config.key] || 0;
            if (retries >= MAX_RETRY_CLICKS) {
              toast.error('Retry limit reached');
              return;
            }
            retryCountRef.current[config.key] = retries + 1;
            const latest = lastConfigsRef.current[config.key];
            if (latest) {
              void handleQuickAction(latest);
            }
          },
        },
      });
      return false;
    } finally {
      inFlightRef.current[config.key] = false;
    }
  }, [isRoleAllowed, resetActionState]);

  const getActionState = useCallback((key: string): QuickActionState => {
    return actionStates[key] || 'idle';
  }, [actionStates]);

  return {
    handleQuickAction,
    getActionState,
  };
}
