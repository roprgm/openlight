import { useEffect, useId, useRef, useState } from "react";
import { useGpu } from "vgpu-react";
import { useDocument, useScene } from "@/components/editor/session";
import type { Gradient } from "@/core/document";
import { renderBitmap } from "@/core/renderer";
import { MaskFill } from "./mask-fill";

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
    <canvas
      ref={canvas}
      width={64}
      height={64}
      aria-label="Original image thumbnail"
      title={error ?? "Original image"}
      className="size-8 shrink-0 rounded-sm border border-neutral-600 bg-neutral-950"
    />
  );
}

export function MaskThumbnail({ mask }: { mask: Gradient }) {
  const id = useId();
  const document = useDocument();
  const sourceId = useScene((scene) => scene.layers[0].source);
  const size = document.resources.get(sourceId).image.size;
  return (
    <svg
      aria-label="Gradient mask thumbnail"
      role="img"
      viewBox={`0 0 ${size[0]} ${size[1]}`}
      className="size-8 shrink-0 rounded-sm border border-neutral-600 bg-neutral-950"
    >
      <defs>
        <MaskFill id={id} mask={mask} />
      </defs>
      <rect width={size[0]} height={size[1]} fill={`url(#${id})`} />
    </svg>
  );
}
