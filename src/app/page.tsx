import Link from "next/link";
import { LeagueSelector } from "@/components/LeagueSelector";

export default function Home() {
  return (
    <>
      <header className="border-b-2 border-gold bg-chrome text-chrome-ink">
        <div className="mx-auto max-w-4xl px-6 py-10">
          <p className="label-eyebrow text-xs text-gold">Modelo de Poisson · datos en vivo</p>
          <h1 className="mt-2 text-4xl font-semibold uppercase tracking-tight sm:text-5xl">Predictor</h1>
          <p className="mt-2 max-w-lg text-sm text-chrome-ink/70">
            Probabilidades y cuotas de mercados de fútbol calculadas desde estadísticas reales de local y
            visitante. Elige una liga para armar un partido.
          </p>
          <div className="mt-4 flex gap-4">
            <Link href="/rendimiento" className="label-eyebrow inline-block text-xs text-gold hover:text-paper">
              Ver rendimiento del modelo →
            </Link>
            <Link href="/apuestas" className="label-eyebrow inline-block text-xs text-gold hover:text-paper">
              Ver control de apuestas →
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
        <h2 className="label-eyebrow text-xs text-ink-soft">Ligas disponibles</h2>
        <LeagueSelector />
      </main>
    </>
  );
}
