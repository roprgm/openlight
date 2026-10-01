import { Notice } from "@roprgm/ui/notice";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import { useGpu } from "vgpu-react";
import { useDocumentMapping } from "@/components/editor/mapping";
import { useRenderer } from "@/components/editor/pipeline";
import { useDocument } from "@/components/editor/session";
import { useViewport } from "@/components/editor/viewport";
import { locateLayer, type RangeMask } from "@/core/document";
import { sampleImage } from "@/core/renderer";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { setLayerMask } from "./edits";
import { useMaskTool } from "./mask-tool";

/** Samples the image below the mask, so the overlay and its adjustments never change the sample. */
export function RangeOverlay({ shape }: { shape: RangeMask["kind"] }) {
  const gpu = useGpu();
  const document = useDocument();
  const renderer = useRenderer();
  const camera = useViewport();
  const mapping = useDocumentMapping();
  const tool = useMaskTool();
  const request = useRef(0);
  const [error, setError] = useState<string>();
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  useShortcuts({ escape: () => tool.edit(), enter: () => tool.edit() });
  async function pick(event: PointerEvent<HTMLDivElement>) {
    const box = camera.ref.current?.getBoundingClientRect();
    if (event.button !== 0 || !event.isPrimary || camera.panMode || !box) {
      return;
    }
    const point = mapping.toDocument(event.clientX, event.clientY, box);
    const scene = document.scene.getState();
    const size = document.resources.get(scene.layers[0].source).image.size;
    if (
      point[0] < 0 ||
      point[1] < 0 ||
      point[0] >= size[0] ||
      point[1] >= size[1]
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const selected = document.selection.getState().layerId;
    const location = locateLayer(scene.layers, selected);
    const layer = location?.layer;
    const group = location?.parent?.kind === "mask" ? location.parent : layer;
    const existing =
      layer?.kind === "mask" && layer.mask.kind === shape && !tool.pending
        ? layer.mask
        : undefined;
    const nesting = tool.pending?.shape === shape;
    const image =
      (existing || nesting) && group?.kind === "mask"
        ? renderer.maskSourceImage(group.id)
        : renderer.fullImage();
    if (!image) {
      return;
    }
    const token = ++request.current;
    setError(undefined);
    try {
      const sampled = await sampleImage(gpu, image, [
        (point[0] * image.size[0]) / size[0],
        (point[1] * image.size[1]) / size[1],
      ]);
      if (
        token !== request.current ||
        document.closed ||
        scene !== document.scene.getState() ||
        selected !== document.selection.getState().layerId
      ) {
        return;
      }
      if (shape === "color-range") {
        const mask: RangeMask = {
          kind: shape,
          color: sampled.color,
          tolerance: 0.25,
          smoothness: 0.5,
        };
        if (existing?.kind === shape) {
          setLayerMask(document, selected, {
            ...existing,
            color: sampled.color,
          });
        } else {
          tool.create(mask);
        }
        return;
      }
      const min = Math.max(0, sampled.luminance - 0.1);
      const max = Math.min(1, sampled.luminance + 0.1);
      if (existing?.kind === shape) {
        setLayerMask(document, selected, { ...existing, min, max });
      } else {
        tool.create({ kind: shape, min, max, smoothness: 0.5 });
      }
    } catch (error) {
      if (token === request.current && !document.closed) {
        setError(String(error));
      }
    }
  }
  return (
    <div
      role="application"
      aria-label="Range mask canvas"
      className="absolute inset-0 touch-none cursor-crosshair data-[pan=true]:pointer-events-none"
      data-pan={camera.panMode}
      onPointerDown={(event) => {
        void pick(event);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {error && (
        <Notice tone="alert" className="absolute bottom-3 left-3">
          Cannot sample the photo: {error}
        </Notice>
      )}
    </div>
  );
}
