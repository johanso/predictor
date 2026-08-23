# Predictor de Fútbol

Aplicación **Next.js 16** que estima probabilidades de los mercados de apuestas de fútbol
(1X2, marcador exacto, ambos anotan, doble oportunidad, over/under, marca cada equipo) y las
compara con las **cuotas reales** de una casa de apuestas para calcular valor esperado y stake.

Datos deportivos de [football-data.org](https://www.football-data.org) y cuotas de
[odds-api.io](https://odds-api.io), ambos en plan gratuito. Cubre las 10 competiciones del plan.

> Para trabajar en el código, lee primero [AGENTS.md](AGENTS.md): tiene la bitácora del
> proyecto, las decisiones de diseño que no conviene revertir y las trampas conocidas.

## Cómo funciona el modelo

Cada equipo recibe un parámetro de **ataque** y otro de **defensa**, ajustados todos a la vez
por **máxima verosimilitud** junto con la ventaja de local y el rho de Dixon-Coles, de modo que
maximicen la probabilidad de todos los resultados realmente observados
(`src/lib/poisson/dixonColesFit.ts`):

```
λ_local     = exp(ataque[local]     + defensa[visitante] + ventajaLocal)
λ_visitante = exp(ataque[visitante] + defensa[local])
```

Al ser un ajuste conjunto, la fuerza queda medida **relativa al rival que se enfrentó**: golear
al colista no cuenta igual que golear al líder. La optimización usa Adam sobre el gradiente
analítico, con decaimiento temporal y regularización L2.

Con esos dos λ se construye una matriz de Poisson bivariante (0-10 goles por lado), corregida
por Dixon-Coles en los marcadores bajos, de la que salen todos los mercados.

Todo se ajusta por liga: la ventaja de local sale **1.43x en Brasil y 1.25x en Italia**, y el rho
va de −0.124 a +0.007 según la competición.

Existe además un camino de respaldo (cocientes de promedios, Maher 1982) que se usa solo si aún
no hay partidos cacheados para esa competición.

### Qué tan bueno es

Backtest walk-forward sobre 5 ligas y 3735 partidos, sin mirar el futuro:

| Liga | Fórmula original | Fórmula actual |
|---|---|---|
| España | +4.76% | **+6.46%** |
| Italia | +6.43% | **+7.51%** |
| Inglaterra | +4.86% | **+5.68%** |
| Alemania | +3.96% | **+4.98%** |
| Brasil | +0.41% | **+2.27%** |
| **Agrupado** | +4.10% | **+5.42%** (t=4.55) |

Los porcentajes son mejora de log loss sobre las tasas base de la liga. Mejora en las 5 con
ajustes idénticos, elegidos en 2023-24 y verificados en un 2025 que la búsqueda nunca vio.

**Esto no significa que le gane al mercado.** Una casa de apuestas ronda 8-12% de habilidad y
además cobra 5-7% de margen. La app existe para dar una base bien calibrada, no para garantizar
ganancias. Medido por mercado, ninguno mostró señal estadísticamente distinguible del azar — esos
números se muestran en la propia interfaz al seleccionar una apuesta.

## Requisitos

- Node.js 20+
- API key gratuita de [football-data.org](https://www.football-data.org/client/register)
- API key gratuita de [odds-api.io](https://odds-api.io) (opcional — sin ella la app funciona,
  solo hay que escribir las cuotas a mano)

## Setup

```bash
npm install
cp .env.example .env     # pegar las claves
npx prisma migrate dev   # crea prisma/dev.db
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).

## Scripts

- `npm run dev` — servidor de desarrollo
- `npm run build` — build de producción
- `npm test` — 112 tests (Vitest)
- `npx prisma studio` — inspeccionar la base SQLite

Los backtests offline se corren aparte y necesitan datos descargados; ver [AGENTS.md](AGENTS.md).

## Estructura

- `src/lib/poisson/` — el modelo, puro y sin dependencias de red ni DB
- `src/lib/oddsApi/` — cuotas reales: cliente, mercados, emparejado de partidos, control de cuota
- `src/lib/betting/` — Kelly, liquidación, fiabilidad medida por mercado
- `src/lib/predictions/` — seguimiento y evaluación de pronósticos
- `src/lib/cache/` — capas de caché sobre SQLite
- `scripts/` — backtests offline
- `prisma/schema.prisma` — esquema de la base

## Nota sobre las fuentes de datos

El endpoint `/standings` del plan gratuito de football-data.org solo devuelve la tabla `TOTAL`,
sin splits local/visitante. La app descarga los partidos finalizados
(`/matches?status=FINISHED`) y los agrega equipo por equipo
(`src/lib/cache/standingsCache.ts:aggregateFromMatches`). Ese mismo caché de partidos alimenta el
ajuste del modelo.

Las cuotas se piden por lotes de 10 partidos y se cachean 30 minutos: preciar una jornada completa
cuesta 4 peticiones de las 500 diarias. En el plan gratuito de odds-api.io solo Bet365 devuelve
datos en la práctica.
