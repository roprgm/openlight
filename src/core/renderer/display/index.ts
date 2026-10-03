import {
  type Buffer,
  effect,
  type Frame,
  frame,
  type Gpu,
  sampler,
  surface,
  type Target,
  target,
} from "vgpu";
import type { Mask, MaskModifier } from "@/core/document";
import { type Primaries, primariesIndex } from "@/core/image";
import {
  frameTransform,
  type ImageFrame,
  imageFrame,
  type Point,
} from "@/core/image/frame";
import {
  gradientModifiers,
  gradientParams,
  modifierData,
} from "@/core/renderer/blend";
import { weakMemo } from "@/lib/weak-memo";
import coverageShader from "./coverage.wgsl";
import shader from "./image.wgsl";

export type View = { zoom: number; pan: readonly [number, number] };
export type Clipping = { shadows: boolean; highlights: boolean };
/** A mask to tint over the displayed image; its geometry lives in source pixels, or in a rasterized coverage texture. */
export type MaskOverlay = {
  mask: Mask;
  modifiers: readonly MaskModifier[];
  coverage?: Target;
  /** The layer's opacity, which scales its coverage. */
  opacity?: number;
};
/** The photo's source as decoded, in its own primaries, and the frame that places the image over it. */
export type DisplaySource = {
  image: Target;
  frame: ImageFrame;
  primaries: Primaries;
};
type DisplayOptions = {
  view: View;
  viewport?: readonly number[];
  frame?: ImageFrame;
  /** The primaries the image's texels are in; the working space's unless said. */
  primaries?: Primaries;
  /** The pixels `image` stands for when a proxy reduces it; its own size unless said. */
  imageSize?: Point;
  /** Shown left of `split` in place of the image, and where the mask overlay is drawn; the image itself without one. */
  source?: DisplaySource;
  split?: number;
  clipping?: Clipping;
  overlay?: MaskOverlay;
};

/** Display any transformed image with optional comparison, clipping indicators, and mask overlay. */
export function createDisplay(gpu: Gpu) {
  // Stands in for the coverage binding when no rasterized mask is shown.
  const blank = target(gpu, { size: [1, 1], format: "r8unorm" });
  const draw = effect(gpu, shader, {
    set: {
      sourceSampler: sampler(gpu, { magFilter: "linear", minFilter: "linear" }),
      coverage: blank.color,
    },
  });
  let modifiers: Buffer | undefined;
  function writeModifiers(overlay?: MaskOverlay) {
    const data = modifierData(overlay?.modifiers ?? []);
    if (!modifiers || modifiers.options.size < data.byteLength) {
      modifiers?.dispose();
      modifiers = gpu.device.createBuffer({
        size: data.byteLength,
        usage: ["storage", "copy_dst"],
      });
      draw.set({ modifiers });
    }
    if (overlay) {
      modifiers.write(data);
    }
  }
  function display(
    frame: Frame,
    canvas: Target & { dpr: number },
    image: Target,
    options: DisplayOptions,
  ) {
    const represented = options.imageSize ?? image.size;
    const geometry = options.frame ?? imageFrame(represented);
    const viewport =
      options.viewport ?? canvas.size.map((value) => value / canvas.dpr);
    const overlay = options.overlay;
    const source = options.source;
    writeModifiers(overlay);
    frame.pass(
      canvas,
      draw.set({
        source: image.color,
        original: (source?.image ?? image).color,
        primaries: {
          image: primariesIndex[options.primaries ?? "rec2020"],
          original: primariesIndex[source?.primaries ?? "rec2020"],
        },
        transform: frameTransform(geometry, represented),
        split: options.split ?? -1,
        view: {
          size: canvas.size,
          fitSize: viewport.map((value) => value * canvas.dpr),
          imageSize: geometry.size,
          pan: options.view.pan.map((value) => value * canvas.dpr),
          zoom: options.view.zoom,
          shadows: Number(options.clipping?.shadows ?? false),
          highlights: Number(options.clipping?.highlights ?? false),
        },
        sourceTransform: frameTransform(
          source?.frame ?? geometry,
          source?.image.size ?? represented,
        ),
        coverage: (overlay?.coverage ?? blank).color,
        overlay: {
          ...gradientParams(overlay?.mask),
          ...(overlay?.coverage ? { kind: 3 } : {}),
          modifierCount: overlay
            ? gradientModifiers(overlay.modifiers).length
            : 0,
          sourceSize: source?.image.size ?? represented,
          opacity: overlay?.opacity ?? 1,
        },
      }),
    );
  }
  return Object.assign(display, {
    dispose() {
      modifiers?.dispose();
      modifiers = undefined;
      blank.color.dispose();
    },
  });
}

/** Off-screen drawing keeps one display and one coverage pass per GPU, released with its device. */
const bitmapDisplay = weakMemo((gpu: Gpu) => createDisplay(gpu));
const coveragePreview = weakMemo((gpu: Gpu) => effect(gpu, coverageShader));

export type CoverageRegion = { origin: Point; extent: Point };

/** Draws a coverage raster, or a region of it in raster pixels, as a gray preview of `size` and takes its pixels; no texture outlives the call. */
export async function renderCoverage(
  gpu: Gpu,
  coverage: Target,
  size: Point,
  region: CoverageRegion = { origin: [0, 0], extent: coverage.size },
) {
  const preview = coveragePreview(gpu);
  const canvas = new OffscreenCanvas(size[0], size[1]);
  const output = surface(gpu, canvas, { size, dpr: 1 });
  try {
    frame(gpu, (frame) =>
      frame.pass(
        output,
        preview.set({
          coverage: coverage.color,
          params: { size, origin: region.origin, extent: region.extent },
        }),
      ),
    );
    await gpu.gpu.queue.onSubmittedWorkDone();
    return canvas.transferToImageBitmap();
  } finally {
    output.dispose();
  }
}

/**
 * Draws an image, in the working space's primaries unless said, into an off-screen canvas of `size`
 * and takes its pixels; one display serves each GPU.
 */
export async function renderBitmap(
  gpu: Gpu,
  image: Target,
  size: Point,
  primaries?: Primaries,
) {
  const display = bitmapDisplay(gpu);
  const canvas = new OffscreenCanvas(size[0], size[1]);
  const output = surface(gpu, canvas, { size, dpr: 1 });
  try {
    frame(gpu, (frame) =>
      display(frame, output, image, {
        view: { zoom: 1, pan: [0, 0] },
        primaries,
      }),
    );
    // Finish the draw before the 2D canvas reads it; otherwise Chrome waits a full second for the sync.
    await gpu.gpu.queue.onSubmittedWorkDone();
    return canvas.transferToImageBitmap();
  } finally {
    output.dispose();
  }
}
