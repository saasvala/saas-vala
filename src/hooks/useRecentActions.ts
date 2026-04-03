import { useCallback, useEffect, useState } from 'react';

export type RecentAction = {
  label: string;
  href: string;
  at: string;
};

const STORAGE_KEY = 'sv_recent_actions';
const LIMIT = 8;

export function useRecentActions() {
  const [actions, setActions] = useState<RecentAction[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setActions(parsed.slice(0, LIMIT));
      }
    } catch {
      setActions([]);
    }
  }, []);

  const pushAction = useCallback((entry: Omit<RecentAction, 'at'>) => {
    const nextEntry: RecentAction = { ...entry, at: new Date().toISOString() };
    setActions((prev) => {
      const filtered = prev.filter((item) => item.href !== entry.href);
      const next = [nextEntry, ...filtered].slice(0, LIMIT);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  return { actions, pushAction };
}

