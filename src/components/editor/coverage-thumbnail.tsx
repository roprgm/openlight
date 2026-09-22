import { type ReactNode, useEffect, useRef, useState } from "react";
import { useGpu } from "vgpu-react";
import { type CoverageRegion, renderCoverage } from "@/core/renderer";
import { useRenderer } from "./pipeline";
import { useDocument } from "./session";

/**
 * The renderer's coverage raster for one id, drawn into a small canvas after each committed change.
 * `version` is the scene content the raster follows; a change redraws once its gesture ends.
 * Without a raster, such as a mask that paints nothing yet, the fallback shows instead.
 */
export function CoverageThumbnail({
  id,
  version,
  region,
  label,
  fallback,
}: {
  id: string;
  version: unknown;
  region?: CoverageRegion;
  label: string;
  fallback: ReactNode;
}) {
  const gpu = useGpu();
  const document = useDocument();
  const renderer = useRenderer();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [raster, setRaster] = useState(false);
  const [ready, setReady] = useState<unknown>();
  useEffect(() => {
    function check() {
      const coverage = renderer.coverage(id);
      setRaster(coverage !== undefined);
      if (coverage && !document.history.status.getState().editing) {
        setReady(version);
      }
    }
    // A gesture's end renders nothing new when the scene already rendered in full.
    const unsubscribe = document.history.status.subscribe(check);
    const detach = renderer.subscribe(check);
    return () => {
      unsubscribe();
      detach();
    };
  }, [renderer, document, id, version]);
  useEffect(() => {
    const coverage = ready !== undefined && renderer.coverage(id);
    if (!coverage) return;
    let active = true;
    renderCoverage(gpu, coverage, [64, 64], region)
      .then((bitmap) => {
        const context = canvas.current?.getContext("2d");
        if (active && context) context.drawImage(bitmap, 0, 0);
        bitmap.close();
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [gpu, renderer, id, ready, region]);
  if (!raster) return fallback;
  return (
    <canvas
      ref={canvas}
      width={64}
      height={64}
      aria-label={label}
      className="size-8 shrink-0 rounded-sm border border-neutral-600 bg-neutral-950"
    />
  );
}
