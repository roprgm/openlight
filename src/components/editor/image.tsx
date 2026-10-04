import { useEffect, useMemo } from "react";
import { useCanvas, useFrame, useGpu } from "vgpu-react";
import { useStore } from "zustand";
import type { Preview } from "@/core/document";
import type { EncodedImage } from "@/core/image";
import {
  correctionStretch,
  type ImageFrame,
  imageFrame,
} from "@/core/image/frame";
import { createDisplay } from "@/core/renderer";
import { useDisposable } from "@/hooks/use-disposable";
import { fitScale } from "@/hooks/use-pan-zoom";
import { useRenderer } from "./pipeline";
import { useDocument, useScene } from "./session";
import { useViewport } from "./viewport";

type Output = "fullImage" | "outputImage";

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
  /** A renderer output, or a target to show as it is, such as an export preview. */
  image?: Output | EncodedImage;
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
  // The frame that places the shown image over the source: a crop's draft, or the scene's.
  const placing = geometry ?? sceneFrame;
  const stretch = useMemo(
    () => correctionStretch(placing, sourceSize),
    [placing, sourceSize],
  );
  const display = useDisposable(() => createDisplay(gpu), [gpu]);
  // A renderer output tells the preview how many device pixels a source pixel gets where perspective
  // enlarges the photo most, which renders reduce the source to about.
  const density =
    (camera.scale * devicePixelRatio * stretch) / Math.abs(placing.scale[0]);
  useEffect(() => {
    if (typeof image === "string") {
      document.preview.setState({ density });
    }
  }, [document, image, density]);
  // A proxy output is smaller than what it stands for: the source, or the frame cut from it; the
  // source's own frame places the former over the source, and the scene's the latter.
  const represented = { fullImage: sourceSize, outputImage: sceneFrame.size };
  const placed = { fullImage: imageFrame(sourceSize), outputImage: sceneFrame };
  const render = useFrame((frame) => {
    const target = typeof image === "string" ? renderer[image]() : image.image;
    const imageSize =
      typeof image === "string" ? represented[image] : target.size;
    const size = geometry?.size ?? imageSize;
    const view = {
      ...camera.view,
      zoom: camera.scale / (fitScale(size, camera.viewport) || 1),
    };
    const overlay = preview.maskOverlay;
    display(frame, canvas, target, {
      view,
      viewport: camera.viewport,
      frame: geometry,
      imageSize,
      primaries: typeof image === "string" ? undefined : image.primaries,
      source:
        comparable && typeof image === "string"
          ? {
              image: source.image,
              frame: placed[image],
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
