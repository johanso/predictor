"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { formatPercent } from "@/lib/format";
import type { BankrollStatus } from "@/lib/betting/stats";

function StatTile({ label, value, tone }: { label: string; value: string; tone?: "pitch" | "red" }) {
  const toneClass = tone === "pitch" ? "text-pitch" : tone === "red" ? "text-red" : "text-ink";
  return (
    <div className="flex flex-col gap-1 border border-line bg-paper-raised p-4 text-center">
      <span className={`font-numeric text-2xl font-semibold ${toneClass}`}>{value}</span>
      <span className="label-eyebrow text-xs text-ink-soft">{label}</span>
    </div>
  );
}

export function BankrollCard({ status }: { status: BankrollStatus }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(String(status.startingBalance));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const value = Number(input);
    if (!(value >= 0)) return;
    setSaving(true);
    try {
      await fetch("/api/bankroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startingBalance: value }),
      });
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const yieldPct = status.totalStaked > 0 ? status.totalProfit / status.totalStaked : null;

  return (
    <Card title="Banca">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Banca inicial" value={status.startingBalance.toFixed(2)} />
        <StatTile label="Banca actual" value={status.currentBalance.toFixed(2)} tone={status.totalProfit >= 0 ? "pitch" : "red"} />
        <StatTile label="Profit total" value={status.totalProfit.toFixed(2)} tone={status.totalProfit >= 0 ? "pitch" : "red"} />
        <StatTile label="Yield total" value={yieldPct !== null ? formatPercent(yieldPct) : "—"} />
      </div>

      {status.pendingCount > 0 && (
        <p className="mt-3 text-xs text-ink-soft">{status.pendingCount} apuesta(s) pendiente(s) de liquidar.</p>
      )}

      <div className="mt-4 border-t border-line pt-3">
        {editing ? (
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1.5">
              <span className="label-eyebrow text-xs text-ink-soft">Nueva banca inicial</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="border border-line bg-paper-raised px-3 py-1.5 text-sm text-ink outline-none focus:border-pitch"
              />
            </label>
            <button
              onClick={handleSave}
              disabled={saving}
              className="label-eyebrow bg-ink px-3 py-2 text-xs text-paper hover:bg-pitch disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button onClick={() => setEditing(false)} className="label-eyebrow border border-line px-3 py-2 text-xs text-ink-soft">
              Cancelar
            </button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="label-eyebrow text-[0.65rem] text-ink-soft hover:text-pitch">
            Ajustar banca inicial (depósito/retiro) →
          </button>
        )}
      </div>
    </Card>
  );
}
