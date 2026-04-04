import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";

const BLOCKED_KEYS = new Set(["c", "x", "u", "s", "a"]);

export function ClientProtection() {
  const { user } = useAuth();
  const [clientIp, setClientIp] = useState("unknown-ip");
  const [devtoolsBlocked, setDevtoolsBlocked] = useState(false);

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };
    const onCopy = (event: ClipboardEvent) => {
      event.preventDefault();
    };
    const onCut = (event: ClipboardEvent) => {
      event.preventDefault();
    };
    const onSelectStart = (event: Event) => {
      event.preventDefault();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && BLOCKED_KEYS.has(key)) {
        event.preventDefault();
      }
      if (event.key === "F12") {
        event.preventDefault();
      }
    };

    document.body.classList.add("sv-protected");
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("selectstart", onSelectStart);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.classList.remove("sv-protected");
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("selectstart", onSelectStart);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      const devtoolsOpen = widthDiff > 100 || heightDiff > 100;
      if (devtoolsOpen) {
        setDevtoolsBlocked(true);
      }
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadIp = async () => {
      try {
        const response = await fetch("https://api.ipify.org?format=json");
        if (!response.ok) return;
        const payload = (await response.json()) as { ip?: string };
        if (isMounted && payload.ip) {
          setClientIp(payload.ip);
        }
      } catch {
        // Best-effort only
      }
    };
    void loadIp();
    return () => {
      isMounted = false;
    };
  }, []);

  const watermarkText = useMemo(() => {
    const email = user?.email || "guest@saasvala";
    return `${email} • ${clientIp}`;
  }, [clientIp, user?.email]);

  if (devtoolsBlocked) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background text-foreground text-2xl font-semibold">
        Blocked
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[9998] overflow-hidden select-none"
      aria-hidden
    >
      <div className="absolute inset-0 opacity-10 [background-image:repeating-linear-gradient(-30deg,transparent_0px,transparent_140px,rgba(255,255,255,0.4)_140px,rgba(255,255,255,0.4)_180px)]" />
      <div className="absolute inset-0 flex items-center justify-center text-sm font-medium tracking-wide opacity-20">
        {watermarkText}
      </div>
    </div>
  );
}
