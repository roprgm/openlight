import { useEffect, useMemo } from "react";
import type { Target } from "vgpu";
import { useCanvas, useFrame, useGpu } from "vgpu-react";
import { useStore } from "zustand";
import type { ImageFrame } from "@/core/image/frame";
import { createDisplay } from "@/core/renderer";
import { fitScale } from "@/hooks/use-pan-zoom";
import { useRenderer } from "./pipeline";
import { useDocument, useScene } from "./session";
import { useViewport } from "./viewport";

type Output = "fullImage" | "outputImage" | "originalImage";

/** Mount a pipeline output or any target; a supplied frame places the full source behind it. */
export function Image({
  image = "outputImage",
  geometry,
  original,
}: {
  /** A renderer output, or a target such as an export preview. */
  image?: Output | Target;
  geometry?: ImageFrame;
  original?: Output;
}) {
  const gpu = useGpu();
  const canvas = useCanvas();
  const camera = useViewport();
  const document = useDocument();
  const preview = useStore(document.preview);
  const sceneFrame = useScene((scene) => scene.frame);
  const sourceSize = document.resources.get(
    useScene((scene) => scene.layers[0].source),
  ).image.size;
  const renderer = useRenderer();
  const display = useMemo(() => createDisplay(gpu), [gpu]);
  useEffect(() => () => display.dispose(), [display]);
  const render = useFrame((frame) => {
    const before = original && renderer[original]();
    const target = typeof image === "string" ? renderer[image]() : image;
    const source =
      preview.comparison === "original" && before ? before : target;
    // A proxy output is smaller than the frame it stands for; zoom follows the frame.
    const size =
      geometry?.size ??
      (typeof image === "string" ? sceneFrame.size : source.size);
    const view = {
      ...camera.view,
      zoom: camera.scale / (fitScale(size, camera.viewport) || 1),
    };
    if (typeof image === "string") {
      // The main canvas tells the renderer how many device pixels a source pixel gets.
      renderer.setDisplayScale(
        (camera.scale * devicePixelRatio) / Math.abs(sceneFrame.scale[0]),
      );
    }
    const overlay = preview.maskOverlay;
    display(frame, canvas, source, {
      view,
      viewport: camera.viewport,
      frame: geometry,
      original: before,
      split: preview.comparison === "split" ? preview.split : -1,
      clipping: preview,
      overlay: overlay && {
        ...overlay,
        frame: sceneFrame,
        sourceSize,
        coverage: overlay.layerId
          ? renderer.coverage(overlay.layerId)
          : undefined,
      },
    });
  });
  useEffect(() => renderer.subscribe(render), [renderer, render]);
  useEffect(
    () => render(),
    [render, camera, preview, geometry, image, sceneFrame, sourceSize],
  );
  return null;
}
