<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Bitácora del proyecto

Léela antes de tocar el modelo, la interfaz de apuestas o las llamadas a APIs externas.
Varias decisiones de aquí son deliberadas y contraintuitivas: revertirlas "simplificando"
rompe cosas que costaron medirse.

## Qué es y para qué

App local de un solo usuario que estima probabilidades de mercados de fútbol y las compara
con las cuotas reales de una casa de apuestas. El usuario apuesta dinero propio en cantidades
pequeñas y hace por su cuenta la investigación extradeportiva (lesiones, alineaciones,
rotaciones). **El trabajo de la app es dar una probabilidad base bien calibrada y ponerla al
lado del precio real** — no decidir por él.

Cubre las 10 competiciones del plan gratuito de football-data.org. El foco práctico ha sido
el Brasileirão porque es la única con temporada en curso durante el desarrollo.

## La realidad medida — no la vendas mejor de lo que es

Backtest walk-forward sobre 5 ligas y 3735 partidos (`scripts/`), sin mirar el futuro:

| | Ventaja sobre las tasas base de la liga |
|---|---|
| Fórmula original (cocientes de promedios) | +4.10% |
| **Fórmula actual (Dixon-Coles ajustado)** | **+5.42%**, t=4.55 |

Por liga: España +6.46%, Italia +7.51%, Inglaterra +5.68%, Alemania +4.98%, Brasil +2.27%.
Mejora en 5 de 5 ligas con ajustes idénticos, sin retocar nada por país.

**Lo que esto NO significa:** que le gane al mercado. Para ganar dinero hace falta superar la
habilidad de la casa *más* su margen (~5-7%), y las casas rondan 8-12% de habilidad sobre las
tasas base. Brasil, además, es la liga más difícil de las cinco.

Por mercado, medido en `scripts/markets.test.ts`: **ningún mercado mostró señal
estadísticamente distinguible del azar** (todos con |t| < 2). Esos números viven en
`src/lib/betting/reliability.ts` y se muestran en la interfaz al seleccionar un mercado, a
propósito: un "valor positivo" significa que el modelo discrepa de la casa, no que tenga razón.

Si mejoras el modelo, **vuelve a correr los backtests y actualiza estos números** — aquí, en
`reliability.ts` y en el README.

## Arquitectura

```
football-data.org ──> standingsCache ──> Match/TeamStanding (SQLite)
   (10 req/min)            │
                           ├──> ratingsCache ──> ajuste Dixon-Coles (memoria)
                           │                          │
                           └──> predict.ts <──────────┘
                                    │
odds-api.io ──────> oddsCache ──> OddsSnapshot ──> BetSlipCard
   (500 req/día)                                        │
                                                   Bet / Bankroll
```

- `src/lib/poisson/` — cálculo puro, sin red ni DB. Es donde vive el modelo.
- `src/lib/oddsApi/` — cliente de cuotas, mapeo de mercados, emparejado de partidos, cuota de uso.
- `src/lib/cache/` — las tres capas de caché (clasificación, ratings ajustados, cuotas).
- `src/lib/betting/` — Kelly, liquidación de apuestas, fiabilidad medida por mercado.
- `src/lib/predictions/` — seguimiento y evaluación de pronósticos.
- `scripts/` — backtests offline. No se ejecutan con `npm test` (ver más abajo).

### Modelo: dos caminos

1. **Principal** — `dixonColesFit.ts` ajusta ataque y defensa de cada equipo, ventaja de local y
   rho, todo por máxima verosimilitud sobre los partidos cacheados, con Adam sobre el gradiente
   analítico. Mide la fuerza *relativa al rival enfrentado*.
2. **Respaldo** — `teamStats.ts` + `matchup.ts`, cocientes de promedios (Maher 1982). Se usa solo
   si la caché de `Match` aún no tiene datos para esa competición.

Ambos desembocan en `buildPredictionFromLambdas()`, así que solo pueden diferir en cómo llegan
a λ, nunca en cómo derivan los mercados.

## Decisiones que NO hay que revertir

Cada una tiene su porqué en el código; esto es el índice.

| Decisión | Por qué |
|---|---|
| **Los pronósticos en seguimiento son inmutables** (`api/predictions/route.ts`) | Hubo un "Actualizar envío" que sobrescribía el registro y reiniciaba su fecha. Permitía sustituir un pronóstico por otro mejor informado tras jugarse más partidos, y las estadísticas pasaban a medir predicciones con ventaja de información. |
| **El seguimiento filtra por calidad de datos, no por confianza del modelo** (`predictions/gate.ts`) | Había un piso del 58% que dejaba pasar el 16% de los partidos, todos de la misma franja estrecha. La calibración solo se puede medir viendo todo el rango, así que filtrar antes de guardar cegaba el gráfico justo donde el modelo más se equivoca. |
| **La tabla de apuestas ordena por puntos de probabilidad, no por EV%** (`BetSlipCard.tsx`) | EV% divide por el stake e infla las cuotas largas: 4 puntos de ventaja son +17% a cuota 3.90 y +9% a 2.20. Ordenar por EV% empuja siempre hacia los longshots, donde un error pequeño del modelo hace más daño. |
| **Los límites de rho salen del producto (techo) y del mayor (piso)** (`dixonColes.ts:rhoBounds`) | Estaban invertidos y permitían un rho que hacía negativa la probabilidad del 0-0. Es fácil de confundir; hay tests que lo fijan. |
| **La forma de tau conserva la masa exactamente** (`dixonColes.ts`) | Los términos en rho se cancelan algebraicamente. Existe una variante circulando por ahí que no cumple esto — no la "corrijas" hacia ella. Hay un test que fija la propiedad. |
| **`united` y `city` NO son palabras ignorables** (`oddsApi/matchTeams.ts`) | Son lo único que separa a Manchester United de Manchester City. Con ellas en la lista, ambos puntuaban 1.000 e intercambiaban cuotas. |
| **El contador de cuota de odds-api vive en la base de datos** (`oddsApi/quota.ts`) | En memoria se reiniciaba con cada recarga del servidor y habría autorizado la petición 501 informando "0 usadas hoy". El de football-data sí puede estar en memoria: su ventana es de 60 segundos. |

## APIs externas y disciplina de cuota

**football-data.org** — 10 req/min. Caché de 6h en `standingsCache`, contador en memoria
(`footballData/rateLimiter.ts`), badge en pantalla.

**odds-api.io** — 100/hora y 500/día. La disciplina está en `oddsCache.ts`:
- `/odds/multi` precia **10 partidos por petición**: una jornada completa cuesta una llamada.
- Caché de 30 min, y un freno de 5 min entre refrescos de la misma competición.
- Medido: preciar una jornada entera del Brasileirão = **4 peticiones**.
- Comprueba ambas ventanas antes de enviar; si una está llena, no envía.

Rarezas de odds-api.io descubiertas a golpes:
- **Pedir varias casas donde una no está disponible anula la respuesta entera.** No devuelve las
  que sí tiene. Por eso se piden solo las seleccionadas en la cuenta.
- El plan gratuito deja seleccionar 2 casas, pero **en la práctica solo Bet365 devuelve datos**
  (se probaron Betano BR, Betnacional, Betsson, 1xBet, Betway, 888Sport, Bet7k: ninguna responde).
- Publica feeds reducidos junto al principal ("Bet365 (no latency)", 3-4 mercados). Se filtran
  por `MIN_USEFUL_MARKETS`.
- `sport` es obligatorio en `/events` aunque filtres por `league`.

## Cómo correr las cosas

```bash
npm run dev        # servidor
npm test           # 112 tests — NO incluye scripts/
npx tsc --noEmit   # typecheck
npx eslint .       # lint

# Backtests offline (necesitan datos descargados, ver más abajo)
npx vitest run --config vitest.backtest.config.ts scripts/leagues.test.ts   # ¿generaliza?
npx vitest run --config vitest.backtest.config.ts scripts/compare.test.ts   # ajustado vs original
npx vitest run --config vitest.backtest.config.ts scripts/markets.test.ts   # fiabilidad por mercado
npx vitest run --config vitest.backtest.config.ts scripts/threshold.test.ts # umbrales
```

Los backtests leen volcados de temporada en `data/{LIGA}/{AÑO}.json`, que **no están en el repo**
(~1 MB cada uno, `/data/` está en `.gitignore`). Para descargarlos, el comando está documentado
en la cabecera de `scripts/backtestLib.ts`. El plan gratuito sirve temporadas pasadas con
`?season=YYYY`, pero solo desde 2023 y a 10 peticiones por minuto.

## Trampas conocidas

- **Tras añadir un modelo a Prisma hay que reiniciar el servidor de desarrollo.** Node conserva
  el cliente generado anterior en memoria y el modelo nuevo llega como `undefined`. Hay guardas
  que lo dicen con todas las letras en `oddsCache.ts` y `quota.ts`.
- **Vitest no carga `.env`.** Next.js sí. Un script en `scripts/` que necesite claves tiene que
  hacer `Object.assign(process.env, dotenv.parse(fs.readFileSync(".env")))` antes de importar
  nada que las use.
- **`dotenv.config()` imprime un banner en stdout.** Si capturas su salida en una variable de
  shell, te llevas el banner además del valor. Usa `dotenv.parse`.
- Los nombres de equipo difieren entre los dos proveedores. `matchTeams.ts` los concilia y
  **devuelve null antes que adivinar** — una casilla vacía es preferible a la cuota de otro partido.

## Estado del producto

Funcionando: predicción con modelo ajustado, comparación con cuotas reales de Bet365 con
autorrelleno, cálculo de valor y Kelly, registro de apuestas con banca, seguimiento de
pronósticos con calibración.

Lo más útil que falta: **registro de la cuota de cierre (CLV)**. Es la única forma de detectar
ventaja real en ~50 apuestas en vez de miles. Si el usuario lo pide, es el siguiente paso natural.
