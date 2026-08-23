import type { ReactNode } from "react";

const TONE_CLASSES = {
  red: "border-red bg-red-dim text-red",
  gold: "border-gold bg-gold-dim text-gold",
  pitch: "border-pitch bg-pitch-dim text-pitch",
} as const;

export function Banner({ tone, children }: { tone: keyof typeof TONE_CLASSES; children: ReactNode }) {
  return <div className={`border-l-4 px-4 py-3 text-sm ${TONE_CLASSES[tone]}`}>{children}</div>;
}
