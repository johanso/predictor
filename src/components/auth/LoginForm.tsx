"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo entrar.");
      router.replace(next);
      // Without this the RSC payload comes from the client router cache and the
      // header still renders as logged out.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="label-eyebrow text-xs text-ink-soft">Código de acceso</span>
        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoFocus
          autoComplete="current-password"
          spellCheck={false}
          placeholder="••••••••••••••••"
          className="font-numeric border border-line bg-paper-raised px-3 py-2 tracking-[0.2em] text-ink outline-none focus:border-pitch"
        />
      </label>

      {error && <p className="text-[0.7rem] text-red">{error}</p>}

      <button
        type="submit"
        disabled={!code.trim() || busy}
        className="label-eyebrow bg-ink px-4 py-2 text-xs text-paper transition-colors hover:bg-pitch disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
