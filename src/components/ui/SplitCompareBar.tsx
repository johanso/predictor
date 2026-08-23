export function SplitCompareBar({
  label,
  homeValue,
  awayValue,
  format = (n: number) => n.toFixed(2),
}: {
  label: string;
  homeValue: number;
  awayValue: number;
  format?: (n: number) => string;
}) {
  const max = Math.max(homeValue, awayValue, 0.0001);
  const homePct = Math.max(4, (homeValue / max) * 100);
  const awayPct = Math.max(4, (awayValue / max) * 100);

  return (
    <div>
      <p className="label-eyebrow mb-1.5 text-center text-[0.65rem] text-ink-soft">{label}</p>
      <div className="flex items-center gap-2">
        <span className="font-numeric w-12 shrink-0 text-right text-sm font-semibold text-pitch">{format(homeValue)}</span>
        <div className="flex h-1.5 flex-1 gap-0.5">
          <div className="flex flex-1 justify-end bg-line">
            <div className="h-full bg-pitch" style={{ width: `${homePct}%` }} />
          </div>
          <div className="flex flex-1 justify-start bg-line">
            <div className="h-full bg-sky" style={{ width: `${awayPct}%` }} />
          </div>
        </div>
        <span className="font-numeric w-12 shrink-0 text-sm font-semibold text-sky">{format(awayValue)}</span>
      </div>
    </div>
  );
}
