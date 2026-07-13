import { LeagueSelector } from "@/components/LeagueSelector";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold">Predictor de Fútbol</h1>
        <p className="mt-1 text-neutral-500">
          Modelo de Poisson sobre estadísticas reales (football-data.org). Elige una liga para empezar.
        </p>
      </div>
      <LeagueSelector />
    </main>
  );
}
