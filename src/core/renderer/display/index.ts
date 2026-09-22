import {
  type Buffer,
  type Effect,
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
import coverageShader from "./coverage.wgsl";
import shader from "./image.wgsl";

export type View = { zoom: number; pan: readonly [number, number] };
export type Clipping = { shadows: boolean; highlights: boolean };
/** A mask to tint over the displayed image; its geometry lives in source pixels, or in a rasterized coverage texture. */
export type MaskOverlay = {
  mask: Mask;
  modifiers: readonly MaskModifier[];
  frame: ImageFrame;
  sourceSize: readonly number[];
  coverage?: Target;
  /** The layer's opacity, which scales its coverage. */
  opacity?: number;
};
type DisplayOptions = {
  view: View;
  viewport?: readonly number[];
  frame?: ImageFrame;
  original?: Target;
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
    const geometry = options.frame ?? imageFrame(image.size);
    const viewport =
      options.viewport ?? canvas.size.map((value) => value / canvas.dpr);
    const overlay = options.overlay;
    writeModifiers(overlay);
    frame.pass(
      canvas,
      draw.set({
        source: image.color,
        original: (options.original ?? image).color,
        transform: frameTransform(geometry, image.size),
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
        maskTransform: frameTransform(
          overlay?.frame ?? geometry,
          overlay?.sourceSize ?? image.size,
        ),
        coverage: (overlay?.coverage ?? blank).color,
        overlay: {
          ...gradientParams(overlay?.mask),
          ...(overlay?.coverage ? { kind: 3 } : {}),
          modifierCount: overlay
            ? gradientModifiers(overlay.modifiers).length
            : 0,
          sourceSize: overlay?.sourceSize ?? image.size,
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

const displays = new WeakMap<Gpu, ReturnType<typeof createDisplay>>();
const previews = new WeakMap<Gpu, Effect>();

export type CoverageRegion = { origin: Point; extent: Point };

/** Draws a coverage raster, or a region of it in raster pixels, as a gray preview of `size` and takes its pixels; no texture outlives the call. */
export async function renderCoverage(
  gpu: Gpu,
  coverage: Target,
  size: Point,
  region: CoverageRegion = { origin: [0, 0], extent: coverage.size },
) {
  let preview = previews.get(gpu);
  if (!preview) {
    preview = effect(gpu, coverageShader);
    previews.set(gpu, preview);
  }
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

/** Draws an image into an off-screen canvas of `size` and takes its pixels; one display serves each GPU. */
export async function renderBitmap(gpu: Gpu, image: Target, size: Point) {
  let display = displays.get(gpu);
  if (!display) {
    display = createDisplay(gpu);
    displays.set(gpu, display);
  }
  const canvas = new OffscreenCanvas(size[0], size[1]);
  const output = surface(gpu, canvas, { size, dpr: 1 });
  try {
    frame(gpu, (frame) =>
      display(frame, output, image, { view: { zoom: 1, pan: [0, 0] } }),
    );
    // Finish the draw before the 2D canvas reads it; otherwise Chrome waits a full second for the sync.
    await gpu.gpu.queue.onSubmittedWorkDone();
    return canvas.transferToImageBitmap();
  } finally {
    output.dispose();
  }
}
