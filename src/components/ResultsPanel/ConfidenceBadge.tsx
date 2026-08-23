import type { ConfidenceInfo } from "@/types/domain";
import { Pill } from "@/components/ui/Pill";
import { Banner } from "@/components/ui/Banner";

const LEVEL_LABEL = { alta: "Confianza alta", media: "Confianza media", baja: "Confianza baja" } as const;
const LEVEL_TONE = { alta: "pitch", media: "gold", baja: "red" } as const;

export function ConfidenceBadge({ confidence }: { confidence: ConfidenceInfo }) {
  return (
    <div className="flex flex-col gap-2">
      <Pill tone={LEVEL_TONE[confidence.level]}>{LEVEL_LABEL[confidence.level]}</Pill>
      {confidence.warnings.map((w, i) => (
        <Banner key={i} tone="gold">
          {w}
        </Banner>
      ))}
    </div>
  );
}
