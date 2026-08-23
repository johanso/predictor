"use client";

import { useEffect, useState } from "react";

interface RateLimitStatus {
  count: number;
  limit: number;
  windowMs: number;
  msUntilNextSlot: number | null;
}

const TONE_CLASS = {
  ok: "border-line bg-paper-raised text-ink-soft",
  close: "border-gold bg-gold-dim text-gold",
  full: "border-red bg-red-dim text-red",
} as const;

export function RateLimitBadge() {
  const [status, setStatus] = useState<RateLimitStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/rate-limit");
        const data = (await res.json()) as RateLimitStatus;
        if (!cancelled) setStatus(data);
      } catch {
        // best-effort — a failed poll just leaves the last known count showing
      }
    }

    poll();
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!status) return null;

  const ratio = status.count / status.limit;
  const tone = ratio >= 1 ? "full" : ratio >= 0.7 ? "close" : "ok";

  return (
    <div
      className={`font-numeric fixed bottom-4 right-4 z-50 border px-3 py-1.5 text-xs shadow-sm print:hidden ${TONE_CLASS[tone]}`}
      title="Llamadas a football-data.org en el último minuto (límite del plan gratuito: 10/min)"
    >
      API {status.count}/{status.limit} <span className="opacity-70">/min</span>
    </div>
  );
}
