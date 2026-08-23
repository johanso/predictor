"use client";

import { useEffect, useState } from "react";

interface OddsQuota {
  configured: boolean;
  lastHour: number;
  hourlyLimit: number;
  lastDay: number;
  dailyLimit: number;
  hourResetsAt: string | null;
  dayResetsAt: string | null;
}

const TONE_CLASS = {
  ok: "border-line bg-paper-raised text-ink-soft",
  close: "border-gold bg-gold-dim text-gold",
  full: "border-red bg-red-dim text-red",
} as const;

function resetLabel(iso: string | null): string {
  if (!iso) return "sin consumo";
  return `se repone ${new Date(iso).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * Sits above the football-data.org badge rather than replacing it — the two APIs
 * have separate budgets and a request to one says nothing about the other.
 */
export function OddsQuotaBadge() {
  const [quota, setQuota] = useState<OddsQuota | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/odds-quota");
        const data = (await res.json()) as OddsQuota;
        if (!cancelled) setQuota(data);
      } catch {
        // best-effort — a failed poll leaves the last known counts showing
      }
    }

    poll();
    const id = setInterval(poll, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!quota?.configured) return null;

  // Whichever window is closer to its cap decides the colour, since either one
  // stops requests going out.
  const worstRatio = Math.max(quota.lastHour / quota.hourlyLimit, quota.lastDay / quota.dailyLimit);
  const tone = worstRatio >= 1 ? "full" : worstRatio >= 0.7 ? "close" : "ok";
  const dayLeft = quota.dailyLimit - quota.lastDay;

  return (
    <div
      className={`font-numeric fixed bottom-14 right-4 z-50 border px-3 py-1.5 text-xs shadow-sm print:hidden ${TONE_CLASS[tone]}`}
      title={`Cuotas (odds-api.io) — ${quota.lastHour}/${quota.hourlyLimit} esta hora (${resetLabel(quota.hourResetsAt)}), ${quota.lastDay}/${quota.dailyLimit} hoy (${resetLabel(quota.dayResetsAt)}). Quedan ${dayLeft} peticiones hoy.`}
    >
      Cuotas {quota.lastDay}/{quota.dailyLimit} <span className="opacity-70">/día</span>
      <span className="ml-2 opacity-70">
        {quota.lastHour}/{quota.hourlyLimit} /h
      </span>
    </div>
  );
}
