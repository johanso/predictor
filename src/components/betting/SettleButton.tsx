"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface SettleResult {
  refreshed: string[];
  failures?: string[];
  settledBets: number;
  evaluatedPredictions: number;
  stillPendingBets?: number;
  message?: string;
}

/**
 * Settlement used to happen only as a side effect of refreshing a league's standings,
 * on another page, so a played match could stay pending indefinitely with nothing
 * indicating when it would update. This makes it explicit and reports what it did.
 */
export function SettleButton({ pendingCount, lastCheckedAt }: { pendingCount: number; lastCheckedAt: string | null }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [result, setResult] = useState<SettleResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSettle() {
    setStatus("working");
    setError(null);
    try {
      const res = await fetch("/api/bets/settle", { method: "POST" });
      const data = (await res.json()) as SettleResult;
      if (!res.ok) throw new Error("No se pudo actualizar.");
      setResult(data);
      setStatus("done");
      router.refresh(); // pull the settled rows into the server-rendered tables
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Error desconocido.");
    }
  }

  function summarise(r: SettleResult): string {
    if (r.message) return r.message;
    const parts: string[] = [];
    if (r.settledBets > 0) parts.push(`${r.settledBets} apuesta${r.settledBets === 1 ? "" : "s"} liquidada${r.settledBets === 1 ? "" : "s"}`);
    if (r.evaluatedPredictions > 0) parts.push(`${r.evaluatedPredictions} pronóstico${r.evaluatedPredictions === 1 ? "" : "s"} evaluado${r.evaluatedPredictions === 1 ? "" : "s"}`);
    if (parts.length === 0) {
      return r.stillPendingBets
        ? "Sin novedades: los resultados aún no están publicados. Vuelve a intentarlo en un rato."
        : "Todo al día.";
    }
    return parts.join(" · ");
  }

  return (
    <div className="flex flex-wrap items-center gap-3 print:hidden">
      <button
        onClick={handleSettle}
        disabled={status === "working"}
        title="Descarga los resultados de las ligas con apuestas pendientes y liquida las que ya se jugaron."
        className="label-eyebrow border border-line px-3 py-2 text-xs text-ink-soft transition-colors hover:border-pitch hover:text-pitch disabled:cursor-not-allowed disabled:opacity-40"
      >
        {status === "working" ? "Actualizando…" : "Actualizar resultados"}
      </button>

      <span className="text-[0.65rem] text-ink-soft">
        {pendingCount > 0 ? `${pendingCount} pendiente${pendingCount === 1 ? "" : "s"}` : "sin pendientes"}
        {lastCheckedAt && ` · últimos resultados ${new Date(lastCheckedAt).toLocaleString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`}
      </span>

      {status === "done" && result && (
        <span className={`text-[0.65rem] ${result.settledBets + result.evaluatedPredictions > 0 ? "text-pitch" : "text-ink-soft"}`}>
          {summarise(result)}
          {result.failures && result.failures.length > 0 && (
            <span className="text-gold"> · {result.failures.join(", ")}</span>
          )}
        </span>
      )}
      {status === "error" && error && <span className="text-[0.65rem] text-red">{error}</span>}
    </div>
  );
}
