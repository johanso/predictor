# Predictor de Fútbol

Una aplicación web basada en **Next.js 16** que calcula probabilidades de los principales
mercados de apuestas de fútbol (1X2, marcador exacto, ambos anotan, doble oportunidad,
over/under) utilizando un modelo estadístico **Poisson** aplicado a datos reales obtenidos de
la API pública **football-data.org**. El proyecto reproduce y mejora la funcionalidad de la
calculadora de Excel (`LIGA‑SERIA‑A‑BRASIL.xlsx`) ofreciendo soporte para diez ligas del plan
gratuito y una interfaz interactiva.

## Cómo funciona el modelo

Para cada equipo se calcula, a partir de sus partidos como local y visitante:

- Goles promedio marcados/recibidos, local y visitante.
- Factor de defensa = goles recibidos promedio del equipo ÷ promedio de la liga.

Para un partido concreto:

```
λ_local     = (goles marcados en casa por el local)      × (factor defensivo visitante del rival)
λ_visitante = (goles marcados fuera por el visitante)     × (factor defensivo local del anfitrión)
```

Con esos dos valores se arma una matriz de probabilidad de Poisson bivariante (0 a 10 goles por
lado) de la que salen todos los mercados. La lógica pura está en `src/lib/poisson/` y tiene tests
(`tests/poisson/`) que verifican los resultados contra los valores exactos del Excel original.

## Requisitos

- Node.js 20+
- Una API key gratuita de [football-data.org](https://www.football-data.org/client/register)

## Setup

```bash
npm install
cp .env.example .env
# editar .env y pegar tu FOOTBALL_DATA_API_KEY
npx prisma migrate dev   # crea prisma/dev.db con las tablas necesarias (ya hecho en este repo)
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).

## Nota sobre la temporada actual

Al momento de escribir esto, las ligas europeas del plan gratuito todavía no arrancan su
temporada — solo el **Brasileirão (BSA)** tiene partidos jugados. Las demás ligas se muestran en
el selector, pero el predictor avisará que "la temporada aún no ha comenzado" hasta que haya
datos.

## Scripts

- `npm run dev` — servidor de desarrollo
- `npm run build` — build de producción
- `npm run test` — tests unitarios del módulo Poisson (Vitest)
- `npx prisma studio` — GUI para inspeccionar la base SQLite cacheada

## Estructura relevante

- `src/lib/poisson/` — módulo puro de cálculo (sin red ni DB), fácil de testear.
- `src/lib/footballData/` — cliente de la API externa y lista de las 10 ligas soportadas.
- `src/lib/cache/standingsCache.ts` — cachea splits local/visitante en SQLite (TTL de 6h) para no
  exceder el límite de 10 req/min del plan gratuito.
- `src/app/leagues/[code]/page.tsx` — página de una liga: selector de equipos + resultados.
- `prisma/schema.prisma` — esquema de la base SQLite (solo caché, no histórico).

## Nota sobre la fuente de datos

El endpoint `/standings` del plan gratuito de football-data.org solo devuelve la tabla `TOTAL`
(no expone splits `HOME`/`AWAY` como se asumió inicialmente). Para conseguir los goles marcados y
recibidos por separado como local y como visitante — que es lo que necesita el modelo — la app
descarga todos los partidos finalizados de la competición (`/matches?status=FINISHED`) y agrega
los resultados equipo por equipo. Esa lógica vive en
`src/lib/cache/standingsCache.ts:aggregateFromMatches`.
