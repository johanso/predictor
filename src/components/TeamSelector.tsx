interface TeamOption {
  teamId: number;
  teamName: string;
}

export function TeamSelector({
  label,
  teams,
  value,
  onChange,
  disabledTeamId,
}: {
  label: string;
  teams: TeamOption[];
  value: number | null;
  onChange: (teamId: number) => void;
  disabledTeamId: number | null;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-neutral-600 dark:text-neutral-300">{label}</span>
      <select
        className="rounded-md border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
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
