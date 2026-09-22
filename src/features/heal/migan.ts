import type { Gpu, Target } from "vgpu";
import type { BrushStroke } from "@/core/document";
import type { Point } from "@/core/image/frame";
import { renderBitmap } from "@/core/renderer";
import { strokeDabs } from "@/core/renderer/mask/dabs";
import { miganBounds } from "./model";

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
        logSeverityLevel: number;
      },
    ): Promise<Session>;
  };
};

type Prepared = { runtime: Runtime; session: Session };

export function createMiganSession(
  runtime: Runtime,
  bytes: ArrayBuffer,
  device: GPUDevice,
) {
  return runtime.InferenceSession.create(bytes, {
    executionProviders: [{ name: "webgpu", device }],
    graphOptimizationLevel: "all",
    // Initialisation warns that shape operations run on the CPU, which is expected for this model.
    logSeverityLevel: 3,
  });
}

async function executeMigan(
  { runtime, session }: Prepared,
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

type MaskRegion = { origin: Point; extent: Point };

/** Hard dabs in model pixels, so the hole covers exactly what the blend paints. */
export function miganMaskDabs(stroke: BrushStroke, region: MaskRegion) {
  const scaleX = modelResolution / region.extent[0];
  const scaleY = modelResolution / region.extent[1];
  return strokeDabs(stroke)
    .filter(([, , , alpha]) => alpha > 0)
    .map(([x, y, radius]) => ({
      x: (x - region.origin[0]) * scaleX,
      y: (y - region.origin[1]) * scaleY,
      rx: radius * scaleX,
      ry: radius * scaleY,
    }));
}

export type MiganRuntime = ReturnType<typeof createMiganRuntime>;

/** Owns one MI-GAN session on the editor device: the model downloads first, where cancelling still saves data, and runs wait for each other because the session rejects overlap. */
export function createMiganRuntime(gpu: Gpu) {
  let ready: Prepared | undefined;
  let creating: Promise<Prepared> | undefined;
  let running: Promise<unknown> = Promise.resolve();
  let disposed = false;
  async function prepare(
    signal?: AbortSignal,
    status?: (message: string) => void,
  ) {
    if (ready) return ready;
    if (creating) return creating;
    status?.("Loading the local AI runtime…");
    const runtime = (await import(
      "./vendor/ort.webgpu.bundle.min.mjs"
    )) as Runtime;
    signal?.throwIfAborted();
    runtime.env.wasm.wasmPaths = {
      wasm: "/vendor/onnxruntime-web-1.30.0/ort-wasm-simd-threaded.asyncify.wasm",
    };
    status?.("Loading the bundled 28 MB AI model…");
    const response = await fetch(modelPath, { signal });
    if (!response.ok)
      throw Error(`AI model failed to load: HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    status?.("Preparing AI Remove on this device…");
    creating ??= createMiganSession(runtime, bytes, gpu.gpu).then(
      async (session) => {
        if (disposed) {
          await session.release();
          throw Error("AI Remove was closed.");
        }
        ready = { runtime, session };
        return ready;
      },
      (error: unknown) => {
        creating = undefined;
        throw error;
      },
    );
    return creating;
  }
  function run(pixels: ImageData, coverage: ImageData, signal?: AbortSignal) {
    const turn = Promise.all([prepare(signal), running]).then(([prepared]) => {
      signal?.throwIfAborted();
      return executeMigan(prepared, pixels, coverage);
    });
    running = turn.catch(() => undefined);
    return turn;
  }
  /** Extracts display-referred model input around the stroke and paints the stroke into its binary mask. */
  async function generate(
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
    context.clearRect(0, 0, modelResolution, modelResolution);
    context.fillStyle = "white";
    for (const dab of miganMaskDabs(stroke, region)) {
      context.beginPath();
      context.ellipse(dab.x, dab.y, dab.rx, dab.ry, 0, 0, Math.PI * 2);
      context.fill();
    }
    const coverage = context.getImageData(
      0,
      0,
      modelResolution,
      modelResolution,
    );
    return { result: await run(pixels, coverage, signal), ...region };
  }
  return {
    get ready() {
      return ready !== undefined;
    },
    prepare,
    generate,
    dispose() {
      disposed = true;
      void creating?.then(
        (prepared) => prepared.session.release(),
        () => undefined,
      );
    },
  };
}
