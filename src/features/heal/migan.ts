import type { Gpu, Target } from "vgpu";
import type { BrushStroke } from "@/core/document";
import type { Point } from "@/core/image/frame";
import { renderBitmap } from "@/core/renderer";
import { miganBounds } from "./model";

const runtimeUrl =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/ort.webgpu.min.mjs";
const modelUrl =
  "https://huggingface.co/andraniksargsyan/migan/resolve/406830d0fa60666da0071c342ad2fbc8f30c5c64/migan_pipeline_v2.onnx";

type Tensor = { data: ArrayLike<number>; dispose(): void };
type Session = {
  outputNames: string[];
  run(inputs: Record<string, Tensor>): Promise<Record<string, Tensor>>;
  release(): Promise<void>;
};
type Runtime = {
  Tensor: new (type: "uint8", data: Uint8Array, dimensions: number[]) => Tensor;
  InferenceSession: {
    create(
      bytes: ArrayBuffer,
      options: { executionProviders: string[]; graphOptimizationLevel: string },
    ): Promise<Session>;
  };
};

type Prepared = { runtime: Runtime; session: Session };
// The editor retains one session for its lifetime; model hosting owns cross-reload caching.
let prepared: Prepared | undefined;

async function load(signal?: AbortSignal, status?: (message: string) => void) {
  status?.("Loading the local AI runtime…");
  const runtime = (await import(/* @vite-ignore */ runtimeUrl)) as Runtime;
  signal?.throwIfAborted();
  status?.("Downloading the 28 MB AI model…");
  const response = await fetch(modelUrl, { signal });
  if (!response.ok)
    throw Error(`AI model download failed: HTTP ${response.status}`);
  status?.("Preparing AI Remove on this device…");
  const session = await runtime.InferenceSession.create(
    await response.arrayBuffer(),
    { executionProviders: ["webgpu"], graphOptimizationLevel: "all" },
  );
  if (signal?.aborted) {
    await session.release();
    signal.throwIfAborted();
  }
  return { runtime, session };
}

export function isMiganReady() {
  return Boolean(prepared);
}

export function prepareMigan(
  signal?: AbortSignal,
  status?: (message: string) => void,
) {
  if (prepared) return Promise.resolve(prepared);
  return load(signal, status).then((value) => {
    prepared = value;
    return value;
  });
}

/** Runs the fixed 512 px MI-GAN model through one session shared by the editor. */
export async function runMigan(pixels: ImageData, coverage: ImageData) {
  const { runtime, session } = await prepareMigan();
  const count = 512 * 512;
  const rgb = new Uint8Array(count * 3);
  const mask = new Uint8Array(count);
  for (let pixel = 0; pixel < count; pixel++) {
    for (let channel = 0; channel < 3; channel++) {
      rgb[channel * count + pixel] = pixels.data[pixel * 4 + channel];
    }
    mask[pixel] = coverage.data[pixel * 4 + 3] > 0 ? 0 : 255;
  }
  const inputs = {
    image: new runtime.Tensor("uint8", rgb, [1, 3, 512, 512]),
    mask: new runtime.Tensor("uint8", mask, [1, 1, 512, 512]),
  };
  let outputs: Record<string, Tensor> | undefined;
  try {
    outputs = await session.run(inputs);
    const data = outputs[session.outputNames[0]].data;
    const result = new ImageData(512, 512);
    for (let pixel = 0; pixel < count; pixel++) {
      for (let channel = 0; channel < 3; channel++) {
        result.data[pixel * 4 + channel] = data[channel * count + pixel];
      }
      result.data[pixel * 4 + 3] = 255;
    }
    return result;
  } finally {
    for (const tensor of Object.values(inputs)) tensor.dispose();
    for (const tensor of Object.values(outputs ?? {})) tensor.dispose();
  }
}

/** Extracts display-referred model input and paints the stroke into its binary mask. */
export async function generateMigan(
  gpu: Gpu,
  image: Target,
  dimensions: Point,
  stroke: BrushStroke,
) {
  const region = miganBounds(stroke, dimensions);
  const scale = Math.min(1, 2048 / Math.max(...dimensions));
  const previewSize: Point = [
    Math.max(1, Math.round(dimensions[0] * scale)),
    Math.max(1, Math.round(dimensions[1] * scale)),
  ];
  const bitmap = await renderBitmap(gpu, image, previewSize);
  const input = new OffscreenCanvas(512, 512);
  const context = input.getContext("2d", { willReadFrequently: true });
  if (!context) throw Error("Canvas is unavailable.");
  context.drawImage(
    bitmap,
    region.origin[0] * scale,
    region.origin[1] * scale,
    region.extent[0] * scale,
    region.extent[1] * scale,
    0,
    0,
    512,
    512,
  );
  bitmap.close();
  const pixels = context.getImageData(0, 0, 512, 512);
  context.clearRect(0, 0, 512, 512);
  context.strokeStyle = "white";
  context.fillStyle = "white";
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = (stroke.size / region.extent[0]) * 512;
  context.beginPath();
  for (const [index, point] of stroke.points.entries()) {
    const x = ((point[0] - region.origin[0]) / region.extent[0]) * 512;
    const y = ((point[1] - region.origin[1]) / region.extent[1]) * 512;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();
  const [x, y] = stroke.points[0];
  context.beginPath();
  context.arc(
    ((x - region.origin[0]) / region.extent[0]) * 512,
    ((y - region.origin[1]) / region.extent[1]) * 512,
    context.lineWidth / 2,
    0,
    Math.PI * 2,
  );
  context.fill();
  const coverage = context.getImageData(0, 0, 512, 512);
  return { result: await runMigan(pixels, coverage), ...region };
}
