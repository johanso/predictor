interface TeamOption {
  teamId: number;
  teamName: string;
}

export function TeamSelector({
  label,
  tone,
  teams,
  value,
  onChange,
  disabledTeamId,
}: {
  label: string;
  tone: "pitch" | "sky";
  teams: TeamOption[];
  value: number | null;
  onChange: (teamId: number) => void;
  disabledTeamId: number | null;
}) {
  const toneClass = tone === "pitch" ? "border-t-pitch focus:border-pitch" : "border-t-sky focus:border-sky";

  return (
    <label className="flex flex-1 flex-col gap-1.5">
      <span className="label-eyebrow text-xs text-ink-soft">{label}</span>
      <select
        className={`border border-line border-t-2 bg-paper-raised px-3 py-2 text-sm text-ink outline-none ${toneClass}`}
        value={value ?? ""}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        <option value="" disabled>
          Selecciona un equipo
        </option>
        {teams.map((t) => (
          <option key={t.teamId} value={t.teamId} disabled={t.teamId === disabledTeamId}>
            {t.teamName}
          </option>
        ))}
      </select>
    </label>
  );
}
