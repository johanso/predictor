import type { ReactNode } from "react";

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    // min-w-0 matters here: as a flex child (every page body is `flex flex-col`),
    // this would otherwise refuse to shrink below its widest descendant (a table),
    // pushing overflow-x-auto's scroll boundary out to the whole page instead of
    // containing it — the classic flexbox min-width:auto gotcha.
    <div className={`min-w-0 border border-line bg-paper-raised p-5 ${className}`}>
      {title && (
        <h3 className="label-eyebrow mb-3 border-b border-line pb-2 text-xs text-ink-soft">{title}</h3>
      )}
      {children}
    </div>
  );
}
