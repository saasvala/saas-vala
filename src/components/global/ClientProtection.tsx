import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const BLOCKED_KEYS = new Set(["c", "x", "u", "s", "a"]);

export function ClientProtection() {
  const { user } = useAuth();
  const [clientIp, setClientIp] = useState("unknown-ip");
  const [devtoolsBlocked, setDevtoolsBlocked] = useState(false);
  const [anonSessionId] = useState(() => {
    const generated = `${Date.now().toString(36)}${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    try {
      const existing = sessionStorage.getItem("sv_anon_session_id");
      if (existing) return existing;
      sessionStorage.setItem("sv_anon_session_id", generated);
    } catch {
      return generated;
    }
    return generated;
  });

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
    const hasTouchSupport =
      "ontouchstart" in window || navigator.maxTouchPoints > 0;
    if (hasTouchSupport) {
      return;
    }

    let consecutiveOpenDetections = 0;
    const intervalId = window.setInterval(() => {
      if (document.fullscreenElement) {
        return;
      }

      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      const devtoolsOpen = window.innerWidth >= 900 && (widthDiff > 160 || heightDiff > 160);

      if (devtoolsOpen) {
        consecutiveOpenDetections += 1;
      } else {
        consecutiveOpenDetections = 0;
        setDevtoolsBlocked(false);
      }

      if (consecutiveOpenDetections >= 3) {
        setDevtoolsBlocked(true);
      }
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    let isMounted = true;
    const loadIp = async () => {
      try {
        const { data } = await supabase
          .from("user_sessions")
          .select("ip_address,last_activity")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .order("last_activity", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (isMounted && data?.ip_address) {
          setClientIp(String(data.ip_address));
        }
      } catch {
        // Best-effort only
      }
    };
    void loadIp();
    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  const watermarkText = useMemo(() => {
    const email = user?.email || `anon-${anonSessionId.slice(0, 8)}`;
    return `${email} • ${clientIp}`;
  }, [anonSessionId, clientIp, user?.email]);

  if (devtoolsBlocked) {
    return (
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-background text-foreground text-2xl font-semibold"
        role="alert"
        aria-live="assertive"
        aria-label="Security block active. Developer tools are not allowed in this view."
      >
        Blocked: Developer tools detected
      </div>
    );
  }

  return (
      <div
        className="pointer-events-none fixed inset-0 z-[9998] overflow-hidden select-none"
        aria-hidden="true"
      >
      <div className="absolute inset-0 opacity-10 [background-image:repeating-linear-gradient(-30deg,transparent_0px,transparent_140px,rgba(255,255,255,0.4)_140px,rgba(255,255,255,0.4)_180px)]" />
      <div className="absolute inset-0 flex items-center justify-center text-sm font-medium tracking-wide opacity-20">
        {watermarkText}
      </div>
    </div>
  );
}
