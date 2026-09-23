import type { ReactNode } from "react";

/** A short instruction in the canvas corner that never takes the pointer. */
export function CanvasHint({ children }: { children: ReactNode }) {
  return (
    <p className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-neutral-800/80 px-3 py-1.5 text-white backdrop-blur-sm">
      {children}
    </p>
  );
}
