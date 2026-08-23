"use client";

import { useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import type { BankrollHistoryPoint } from "@/lib/betting/stats";

const WIDTH = 640;
const HEIGHT = 220;
const PAD_LEFT = 56;
const PAD_RIGHT = 12;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min];
  const step = (max - min) / count;
  return Array.from({ length: count + 1 }, (_, i) => min + step * i);
}

export function BankrollChart({ points, startingBalance }: { points: BankrollHistoryPoint[]; startingBalance: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const { xForIndex, yForBalance, plotWidth, ticks, up } = useMemo(() => {
    const balances = points.map((p) => p.balance);
    const min = Math.min(...balances, startingBalance);
    const max = Math.max(...balances, startingBalance);
    const pad = (max - min) * 0.1 || Math.max(1, max * 0.05); // flat line (no bets yet) still gets breathing room
    const yMin = min - pad;
    const yMax = max + pad;

    const pw = WIDTH - PAD_LEFT - PAD_RIGHT;
    const ph = HEIGHT - PAD_TOP - PAD_BOTTOM;

    const xForIndex = (i: number) => PAD_LEFT + (points.length <= 1 ? 0 : (i / (points.length - 1)) * pw);
    const yForBalance = (b: number) => PAD_TOP + ph - ((b - yMin) / (yMax - yMin)) * ph;

    const last = points[points.length - 1]?.balance ?? startingBalance;

    return { xForIndex, yForBalance, plotWidth: pw, plotHeight: ph, ticks: niceTicks(yMin, yMax), up: last >= startingBalance };
  }, [points, startingBalance]);

  const tone = up ? "pitch" : "red";
  const strokeClass = up ? "stroke-pitch" : "stroke-red";
  const fillClass = up ? "fill-pitch" : "fill-red";

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xForIndex(i)} ${yForBalance(p.balance)}`).join(" ");
  const baselineY = yForBalance(startingBalance);
  const areaPath = `${linePath} L ${xForIndex(points.length - 1)} ${baselineY} L ${xForIndex(0)} ${baselineY} Z`;

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || points.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const xInViewBox = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const step = points.length <= 1 ? 1 : plotWidth / (points.length - 1);
    const idx = Math.round((xInViewBox - PAD_LEFT) / step);
    setHoverIndex(Math.max(0, Math.min(points.length - 1, idx)));
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  if (points.length <= 1) {
    return (
      <Card title="Evolución de banca">
        <p className="text-xs text-ink-soft">Todavía no hay apuestas liquidadas — el gráfico aparece con la primera.</p>
      </Card>
    );
  }

  return (
    <Card title="Evolución de banca">
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full touch-none"
          onPointerMove={handleMove}
          onPointerLeave={() => setHoverIndex(null)}
          role="img"
          aria-label={`Evolución de banca desde ${startingBalance.toFixed(2)} hasta ${points[points.length - 1].balance.toFixed(2)}`}
        >
          {/* gridlines + y-axis labels */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={yForBalance(t)} y2={yForBalance(t)} className="stroke-line" strokeWidth={1} />
              <text x={PAD_LEFT - 8} y={yForBalance(t)} textAnchor="end" dominantBaseline="middle" className="font-numeric fill-ink-soft text-[9px]">
                {t.toFixed(0)}
              </text>
            </g>
          ))}

          {/* baseline at starting balance */}
          <line
            x1={PAD_LEFT}
            x2={WIDTH - PAD_RIGHT}
            y1={baselineY}
            y2={baselineY}
            className="stroke-ink-soft"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <text x={WIDTH - PAD_RIGHT} y={baselineY - 4} textAnchor="end" className="label-eyebrow fill-ink-soft text-[8px]">
            Banca inicial
          </text>

          {/* area wash */}
          <path d={areaPath} className={fillClass} fillOpacity={0.1} stroke="none" />

          {/* line */}
          <path d={linePath} className={strokeClass} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />

          {/* markers */}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={xForIndex(i)}
              cy={yForBalance(p.balance)}
              r={i === points.length - 1 ? 5 : 4}
              className={fillClass}
              stroke="var(--paper-raised)"
              strokeWidth={2}
            />
          ))}

          {/* crosshair */}
          {hovered && (
            <line
              x1={xForIndex(hoverIndex!)}
              x2={xForIndex(hoverIndex!)}
              y1={PAD_TOP}
              y2={HEIGHT - PAD_BOTTOM}
              className="stroke-ink-soft"
              strokeWidth={1}
            />
          )}
        </svg>

        {hovered && hoverIndex !== null && (
          <div
            className="pointer-events-none absolute top-0 -translate-x-1/2 border border-line bg-paper-raised px-2.5 py-1.5 text-xs shadow-sm"
            style={{ left: `${(xForIndex(hoverIndex) / WIDTH) * 100}%` }}
          >
            <p className="font-numeric font-semibold text-ink">{hovered.balance.toFixed(2)}</p>
            <p className="max-w-[12rem] text-[0.65rem] text-ink-soft">{hovered.label}</p>
            <p className="font-numeric text-[0.6rem] text-ink-soft">{new Date(hovered.date).toLocaleDateString("es")}</p>
          </div>
        )}
      </div>
      <p className="mt-2 text-[0.65rem] text-ink-soft">
        {points.length - 1} apuesta(s) liquidada(s) · banca {up ? "por encima" : "por debajo"} de la inicial{" "}
        <span className={`font-numeric font-semibold ${tone === "pitch" ? "text-pitch" : "text-red"}`}>
          ({(points[points.length - 1].balance - startingBalance >= 0 ? "+" : "") + (points[points.length - 1].balance - startingBalance).toFixed(2)})
        </span>
      </p>
    </Card>
  );
}
