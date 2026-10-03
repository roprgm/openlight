import { useEffect, useMemo } from "react";
import type { Target } from "vgpu";
import { useCanvas, useFrame, useGpu } from "vgpu-react";
import { useStore } from "zustand";
import type { Preview } from "@/core/document";
import type { Primaries } from "@/core/image";
import { correctionStretch, type ImageFrame } from "@/core/image/frame";
import { createDisplay } from "@/core/renderer";
import { useDisposable } from "@/hooks/use-disposable";
import { fitScale } from "@/hooks/use-pan-zoom";
import { useRenderer } from "./pipeline";
import { useDocument, useScene } from "./session";
import { useViewport } from "./viewport";

type Output = "fullImage" | "outputImage";
/** A target to show, such as an export preview, in the primaries its texels are in. */
type Shown = { image: Target; primaries: Primaries };

/** How much of the width shows the source photo: none, all, or up to the divider. */
function comparedShare({ comparison, split }: Preview) {
  if (comparison === "original") {
    return 1;
  }
  if (comparison === "split") {
    return split;
  }
  return -1;
}

/** Mount a pipeline output or any target; a supplied frame places the full source behind it. */
export function Image({
  image = "outputImage",
  geometry,
  comparable = false,
}: {
  image?: Output | Shown;
  geometry?: ImageFrame;
  /** Whether the source photo is at hand: the comparison shows it, and the mask overlay is drawn over it. */
  comparable?: boolean;
}) {
  const gpu = useGpu();
  const canvas = useCanvas();
  const camera = useViewport();
  const document = useDocument();
  const preview = useStore(document.preview);
  const sceneFrame = useScene((scene) => scene.frame);
  const source = document.resources.get(
    useScene((scene) => scene.layers[0].source),
  );
  const sourceSize = source.image.size;
  const renderer = useRenderer();
  const stretch = useMemo(
    () => correctionStretch(sceneFrame, sourceSize),
    [sceneFrame, sourceSize],
  );
  const display = useDisposable(() => createDisplay(gpu), [gpu]);
  const render = useFrame((frame) => {
    const target = typeof image === "string" ? renderer[image]() : image.image;
    // A proxy output is smaller than what it stands for: the source, or the frame cut from it.
    const represented =
      typeof image === "string"
        ? image === "fullImage"
          ? sourceSize
          : sceneFrame.size
        : target.size;
    const size = geometry?.size ?? represented;
    const view = {
      ...camera.view,
      zoom: camera.scale / (fitScale(size, camera.viewport) || 1),
    };
    if (typeof image === "string") {
      // The main canvas tells the renderer how many device pixels a source pixel gets where
      // perspective enlarges the photo most.
      renderer.setDisplayScale(
        (camera.scale * devicePixelRatio * stretch) /
          Math.abs(sceneFrame.scale[0]),
      );
    }
    const overlay = preview.maskOverlay;
    display(frame, canvas, target, {
      view,
      viewport: camera.viewport,
      frame: geometry,
      imageSize: represented,
      primaries: typeof image === "string" ? undefined : image.primaries,
      source: comparable
        ? {
            image: source.image,
            frame: sceneFrame,
            primaries: source.primaries,
          }
        : undefined,
      split: comparable ? comparedShare(preview) : -1,
      clipping: preview,
      overlay: overlay && {
        ...overlay,
        coverage: overlay.layerId
          ? renderer.coverage(overlay.layerId)?.target
          : undefined,
      },
    });
  });
  useEffect(() => renderer.subscribe(render), [renderer, render]);
  useEffect(
    () => render(),
    [render, camera, preview, geometry, image, sceneFrame, source],
  );
  return null;
}
