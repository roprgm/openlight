import type { ReactNode } from "react";

/** A short instruction in the canvas corner that never takes the pointer, wrapping short of the zoom control. */
export function CanvasHint({ children }: { children: ReactNode }) {
  return (
    <p className="pointer-events-none absolute bottom-3 left-3 max-w-[calc(100%-9rem)] rounded-2xl bg-level-4/80 px-3 py-1.5 text-balance text-foreground backdrop-blur-sm">
      {children}
    </p>
  );
}
