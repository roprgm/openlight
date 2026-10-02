import { Button } from "@roprgm/ui/button";
import { useEffect, useState } from "react";
import { readGpuStats, resetGpuStats } from "@/lib/gpu-stats";

type Shown = ReturnType<typeof readGpuStats> & {
  fps: number;
  texturesPerSecond: number;
  heap?: number;
};

/** Chromium alone reports the JavaScript heap. */
const memory = (performance as { memory?: { usedJSHeapSize: number } }).memory;

const megabytes = (bytes: number) => `${(bytes / 2 ** 20).toFixed(1)} MB`;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-secondary">{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

/**
 * Frames per second and the GPU's textures and buffers, made, freed, and alive, refreshed every
 * second over the page. Reset starts counting a workflow.
 */
export function GpuStats() {
  const [shown, setShown] = useState<Shown>();
  useEffect(() => {
    let frames = 0;
    let frame = requestAnimationFrame(function count() {
      frames++;
      frame = requestAnimationFrame(count);
    });
    let last = readGpuStats();
    const timer = setInterval(() => {
      const now = readGpuStats();
      setShown({
        ...now,
        fps: frames,
        texturesPerSecond: Math.max(0, now.textures.made - last.textures.made),
        heap: memory?.usedJSHeapSize,
      });
      frames = 0;
      last = now;
    }, 1000);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
    };
  }, []);
  if (!shown) {
    return null;
  }
  const { textures, buffers } = shown;
  return (
    <section
      aria-label="GPU stats"
      className="pointer-events-none fixed top-14 right-2 z-50 md:top-auto md:right-auto md:bottom-14 md:left-14 flex flex-col gap-2 rounded-md bg-level-4/80 px-3 py-2 tabular-nums backdrop-blur-sm"
    >
      <dl className="grid grid-cols-[auto_auto] gap-x-3">
        <Row label="FPS" value={`${shown.fps}`} />
        <Row
          label="Textures"
          value={`${textures.live} live · ${textures.made} made · ${textures.freed} freed · ${shown.texturesPerSecond}/s`}
        />
        <Row
          label="Buffers"
          value={`${buffers.live} live · ${buffers.made} made · ${buffers.freed} freed`}
        />
        <Row
          label="GPU"
          value={`${megabytes(textures.bytes + buffers.bytes)} · peak ${megabytes(shown.peakBytes)}`}
        />
        {shown.heap !== undefined && (
          <Row label="Heap" value={megabytes(shown.heap)} />
        )}
      </dl>
      <Button
        size="sm"
        className="pointer-events-auto self-start"
        onClick={resetGpuStats}
      >
        Reset
      </Button>
    </section>
  );
}
