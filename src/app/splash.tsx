import type { ReactNode } from "react";

/** The page until the editor mounts, and in its place without WebGPU. `index.html` repeats its markup for first paint and crawlers. */
export function Splash({ children }: { children?: ReactNode }) {
  return (
    <main className="grid h-dvh place-content-center justify-items-center gap-1.5 p-6 text-center">
      <img
        alt=""
        className="mb-1.5 w-16"
        height="64"
        src="/logo.svg"
        width="64"
      />
      <h1 className="text-2xl font-bold">OpenLight</h1>
      <p className="text-muted">Edit photos in your browser.</p>
      {children}
    </main>
  );
}
