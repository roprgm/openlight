import type { Gpu, Target } from "vgpu";
import type { BrushStroke } from "@/core/document";
import type { Point } from "@/core/image/frame";
import { renderBitmap } from "@/core/renderer";
import { strokeDabs } from "@/core/renderer/mask/dabs";
import { miganBounds } from "./model";
import { createPreparationGate, createRunQueue } from "./session";

const modelPath = "/models/migan-pipeline-v2.onnx";
const modelResolution = 512;

type Tensor = { data: ArrayLike<number>; dispose(): void };
type Session = {
  outputNames: string[];
  run(inputs: Record<string, Tensor>): Promise<Record<string, Tensor>>;
  release(): Promise<void>;
};
type Runtime = {
  env: { wasm: { wasmPaths: { wasm: string } } };
  Tensor: new (type: "uint8", data: Uint8Array, dimensions: number[]) => Tensor;
  InferenceSession: {
    create(
      bytes: ArrayBuffer,
      options: {
        executionProviders: [{ name: "webgpu"; device: GPUDevice }];
        graphOptimizationLevel: string;
      },
    ): Promise<Session>;
  };
};

type Prepared = { runtime: Runtime; session: Session };

// The editor retains one session for its lifetime; HTTP caching owns cross-reload reuse.
const sessions = createPreparationGate<Prepared>((value) =>
  value.session.release(),
);
const enqueue = createRunQueue();

/** Adopts the editor device and releases a session whose uncancellable creation outlives its request. */
export async function createMiganSession(
  runtime: Runtime,
  bytes: ArrayBuffer,
  device: GPUDevice,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const session = await runtime.InferenceSession.create(bytes, {
    executionProviders: [{ name: "webgpu", device }],
    graphOptimizationLevel: "all",
  });
  if (!signal?.aborted) return session;
  await session.release();
  signal.throwIfAborted();
  throw Error("AI Remove preparation was cancelled.");
}

async function load(
  gpu: Gpu,
  status: ((message: string) => void) | undefined,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  status?.("Loading the local AI runtime…");
  const runtime = (await import(
    "./vendor/ort.webgpu.bundle.min.mjs"
  )) as Runtime;
  signal.throwIfAborted();
  runtime.env.wasm.wasmPaths = {
    wasm: "/vendor/onnxruntime-web-1.30.0/ort-wasm-simd-threaded.asyncify.wasm",
  };
  status?.("Loading the bundled 28 MB AI model…");
  const response = await fetch(modelPath, { signal });
  if (!response.ok)
    throw Error(`AI model failed to load: HTTP ${response.status}`);
  signal.throwIfAborted();
  status?.("Preparing AI Remove on this device…");
  const session = await createMiganSession(
    runtime,
    await response.arrayBuffer(),
    gpu.gpu,
  );
  return { runtime, session };
}

export function isMiganReady() {
  return sessions.ready;
}

export function prepareMigan(
  gpu: Gpu,
  signal?: AbortSignal,
  status?: (message: string) => void,
) {
  return sessions.acquire(signal, (flight) => load(gpu, status, flight));
}

async function executeMigan(
  runtime: Runtime,
  session: Session,
  pixels: ImageData,
  coverage: ImageData,
) {
  const count = modelResolution * modelResolution;
  const rgb = new Uint8Array(count * 3);
  const mask = new Uint8Array(count);
  for (let pixel = 0; pixel < count; pixel++) {
    for (let channel = 0; channel < 3; channel++) {
      rgb[channel * count + pixel] = pixels.data[pixel * 4 + channel];
    }
    mask[pixel] = coverage.data[pixel * 4 + 3] > 0 ? 0 : 255;
  }
  const shape = [modelResolution, modelResolution];
  const inputs = {
    image: new runtime.Tensor("uint8", rgb, [1, 3, ...shape]),
    mask: new runtime.Tensor("uint8", mask, [1, 1, ...shape]),
  };
  let outputs: Record<string, Tensor> | undefined;
  try {
    outputs = await session.run(inputs);
    const data = outputs[session.outputNames[0]].data;
    const result = new ImageData(modelResolution, modelResolution);
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

/** Runs the fixed 512 px MI-GAN model through one session shared by the editor. */
export function runMigan(
  gpu: Gpu,
  pixels: ImageData,
  coverage: ImageData,
  signal?: AbortSignal,
) {
  return prepareMigan(gpu, signal).then(({ runtime, session }) =>
    enqueue(() => executeMigan(runtime, session, pixels, coverage), signal),
  );
}

type MaskRegion = { origin: Point; extent: Point };

/** Hard dabs in model pixels. Feather stays in the blend, so a low-pressure or zero dab does not grow the hole. */
export function miganMaskDabs(stroke: BrushStroke, region: MaskRegion) {
  const scaleX = modelResolution / region.extent[0];
  const scaleY = modelResolution / region.extent[1];
  return strokeDabs(stroke).flatMap(([x, y, radius, alpha]) =>
    alpha <= 0 || radius <= 0
      ? []
      : [
          {
            x: (x - region.origin[0]) * scaleX,
            y: (y - region.origin[1]) * scaleY,
            rx: radius * scaleX,
            ry: radius * scaleY,
          },
        ],
  );
}

function paintMiganMask(
  context: OffscreenCanvasRenderingContext2D,
  stroke: BrushStroke,
  region: MaskRegion,
) {
  context.clearRect(0, 0, modelResolution, modelResolution);
  context.fillStyle = "white";
  for (const dab of miganMaskDabs(stroke, region)) {
    context.beginPath();
    context.ellipse(dab.x, dab.y, dab.rx, dab.ry, 0, 0, Math.PI * 2);
    context.fill();
  }
}

/** Extracts display-referred model input and paints the stroke into its binary mask. */
export async function generateMigan(
  gpu: Gpu,
  image: Target,
  dimensions: Point,
  stroke: BrushStroke,
  signal?: AbortSignal,
) {
  const region = miganBounds(stroke, dimensions);
  const scale = Math.min(1, 2048 / Math.max(...dimensions));
  const previewSize: Point = [
    Math.max(1, Math.round(dimensions[0] * scale)),
    Math.max(1, Math.round(dimensions[1] * scale)),
  ];
  const bitmap = await renderBitmap(gpu, image, previewSize);
  const input = new OffscreenCanvas(modelResolution, modelResolution);
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
    modelResolution,
    modelResolution,
  );
  bitmap.close();
  const pixels = context.getImageData(0, 0, modelResolution, modelResolution);
  paintMiganMask(context, stroke, region);
  const coverage = context.getImageData(0, 0, modelResolution, modelResolution);
  return {
    result: await runMigan(gpu, pixels, coverage, signal),
    ...region,
  };
}
