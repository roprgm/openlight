import { useMemo } from "react";
import { outputOffset, type Point, sourceOffset } from "@/core/image/frame";
import { useScene } from "./session";
import { useViewport } from "./viewport";

/** Converts between viewport pixels and source-pixel document positions through the displayed frame. */
export function useDocumentMapping() {
  const camera = useViewport();
  const frame = useScene((scene) => scene.frame);
  const { view, scale, viewport } = camera;
  return useMemo(
    () => ({
      /** Source pixels per viewport pixel along the frame's axes. */
      pixelsPerViewportPixel: Math.abs(frame.scale[0]) / scale,
      /** The document position under client coordinates, given the viewport bounds. */
      toDocument(clientX: number, clientY: number, box?: DOMRect): Point {
        if (!box) {
          return frame.center;
        }
        const offset = sourceOffset(
          frame,
          (clientX - box.left - box.width / 2 - view.pan[0]) / scale,
          (clientY - box.top - box.height / 2 - view.pan[1]) / scale,
        );
        return [frame.center[0] + offset[0], frame.center[1] + offset[1]];
      },
      /** Viewport pixels, relative to the viewport's top-left corner, of a document position. */
      toScreen(point: Point): Point {
        const [x, y] = outputOffset(
          frame,
          point[0] - frame.center[0],
          point[1] - frame.center[1],
        );
        return [
          viewport[0] / 2 + view.pan[0] + x * scale,
          viewport[1] / 2 + view.pan[1] + y * scale,
        ];
      },
    }),
    [frame, view, scale, viewport],
  );
}
