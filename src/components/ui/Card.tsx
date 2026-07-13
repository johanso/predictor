import type { ReactNode } from "react";

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`border border-line bg-paper-raised p-4 ${className}`}>
      {title && (
        <h3 className="label-eyebrow mb-3 border-b border-line pb-2 text-xs text-ink-soft">{title}</h3>
      )}
      {children}
    </div>
  );
}
