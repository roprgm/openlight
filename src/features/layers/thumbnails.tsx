import { Tooltip } from "@roprgm/ui/tooltip";
import { useEffect, useId, useRef, useState } from "react";
import { useGpu } from "vgpu-react";
import { CoverageThumbnail } from "@/components/editor/coverage-thumbnail";
import { useDocument, useScene } from "@/components/editor/session";
import { Icon } from "@/components/icons/icon";
import type { MaskLayer } from "@/core/document";
import { renderBitmap } from "@/core/renderer";
import { MaskFill } from "./mask-fill";

const frame =
  "size-8 shrink-0 rounded-sm border border-neutral-600 bg-neutral-950";

/** A small original-image snapshot, rendered once when the source changes. */
export function ImageThumbnail() {
  const gpu = useGpu();
  const document = useDocument();
  const sourceId = useScene((scene) => scene.layers[0].source);
  const source = document.resources.get(sourceId);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string>();
  useEffect(() => {
    const release = source.retain();
    let active = true;
    async function draw() {
      try {
        const bitmap = await renderBitmap(gpu, source.image, [64, 64]);
        const context = canvas.current?.getContext("2d");
        if (active && !context) {
          throw Error("Cannot draw image thumbnail.");
        }
        context?.drawImage(bitmap, 0, 0);
        bitmap.close();
      } catch (error) {
        if (active) {
          setError(String(error));
        }
      } finally {
        release();
      }
    }
    void draw();
    return () => {
      active = false;
    };
  }, [gpu, source]);
  return (
    <Tooltip content={error ?? "Original image"}>
      <canvas
        ref={canvas}
        width={64}
        height={64}
        aria-label="Original image thumbnail"
        className={frame}
      />
    </Tooltip>
  );
}

/** A mask's coverage from the renderer's raster; an unpainted brush shows its tool and a gradient draws itself. */
export function MaskThumbnail({ layer }: { layer: MaskLayer }) {
  const id = useId();
  const document = useDocument();
  const sourceId = useScene((scene) => scene.layers[0].source);
  const size = document.resources.get(sourceId).image.size;
  const fallback =
    layer.mask.kind === "brush" ? (
      <span
        role="img"
        aria-label="Empty brush thumbnail"
        className={`grid place-items-center text-neutral-400 ${frame}`}
      >
        <Icon className="size-4">
          <path d="M10 14a3 3 0 0 1-3 3c-1.5 0-3-1-3-1s2-1 2-2.5c0-1.5 1-2.5 2.5-2.5M11 13l7-7a1.4 1.4 0 0 0-2-2l-7 7" />
        </Icon>
      </span>
    ) : (
      <svg
        aria-label="Gradient mask thumbnail"
        role="img"
        viewBox={`0 0 ${size[0]} ${size[1]}`}
        className={frame}
      >
        <defs>
          <MaskFill id={id} mask={layer.mask} />
        </defs>
        <rect width={size[0]} height={size[1]} fill={`url(#${id})`} />
      </svg>
    );
  return (
    <CoverageThumbnail
      id={layer.id}
      version={layer}
      label="Mask thumbnail"
      fallback={fallback}
    />
  );
}
