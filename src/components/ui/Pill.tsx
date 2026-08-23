import type { ReactNode } from "react";

const TONE_CLASSES = {
  pitch: "border-pitch bg-pitch-dim text-pitch",
  sky: "border-sky bg-sky-dim text-sky",
  gold: "border-gold bg-gold-dim text-gold",
  red: "border-red bg-red-dim text-red",
  neutral: "border-line bg-paper text-ink-soft",
} as const;

export function Pill({ tone, children }: { tone: keyof typeof TONE_CLASSES; children: ReactNode }) {
  return (
    <span className={`label-eyebrow inline-flex w-fit items-center gap-1.5 border px-2.5 py-1 text-[0.65rem] ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}
