import { effect, frame, init, type Timer, target, timer } from "vgpu";
import { encodeImage } from "@/app/editor/export/export-image";
import { createImageLayer } from "@/app/editor/layers";
import { createEditorRenderer } from "@/app/editor/renderer";
import type {
  BrushStroke,
  Mask,
  ProcessingLayer,
  Scene,
  StrokePoint,
} from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import { defaultAdjustments } from "@/features/adjustments/model";
import { createHistogram } from "@/features/histogram/histogram";
import { defaultCurve } from "@/features/tone-curves/curve";

export type Workload =
  | "neutral"
  | "color-mixer"
  | "vignette"
  | "detail"
  | "pipeline"
  | "pipeline-input"
  | "masked-exposure"
  | "radial-exposure"
  | "brush-exposure"
  | "layer-stack"
  | "fill"
  | "heal"
  | "heal-empty"
  | "heal-proxy"
  | "pipeline-proxy";

function summarize(values: number[]) {
  const sorted = values.toSorted((a, b) => a - b);
  return {
    samples: values,
    median:
      (sorted[Math.floor((sorted.length - 1) / 2)] +
        sorted[Math.ceil((sorted.length - 1) / 2)]) /
      2,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
  };
}

/** Wavy strokes across the image, three painted and one erased, dabbed every quarter diameter. */
function brushStrokes(size: [number, number]): BrushStroke[] {
  return [0.25, 0.45, 0.65, 0.45].map((row, index) => ({
    mode: index === 3 ? "erase" : "paint",
    size: index === 3 ? 120 : 240,
    feather: 0.5,
    flow: 0.6,
    points: Array.from({ length: 61 }, (_, n): StrokePoint => {
      const x = (size[0] * n) / 60;
      return [x, size[1] * row + 120 * Math.sin(x / 200), 1];
    }),
  }));
}

function benchmarkMask(workload: Workload, size: [number, number]): Mask {
  if (workload === "radial-exposure") {
    return {
      kind: "radial",
      center: [size[0] / 2, size[1] / 2],
      radius: [size[0] * 0.3, size[1] * 0.35],
      angle: 20,
      feather: 0.5,
    };
  }
  if (workload === "brush-exposure") {
    return { kind: "brush", strokes: brushStrokes(size) };
  }
  return {
    kind: "linear",
    start: [0, size[1] * 0.2],
    end: [0, size[1] * 0.8],
  };
}

/** Repeated processing of a resident texture; decoding, display, and export are outside timings. */
export async function benchmarkRendering(
  workload: Workload,
  size: [number, number],
  warmup: number,
  samples: number,
) {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error(
      "No WebGPU adapter. Use the project's Playwright configuration.",
    );
  }
  const timestamps = adapter.features.has("timestamp-query");
  const gpu = await init({
    requiredFeatures: timestamps ? ["timestamp-query"] : [],
  });
  const errors: Error[] = [];
  gpu.onError((error) => errors.push(error));
  const input = target(gpu, { size, format: "rgba16float" });
  const source = createImageSource(input);
  const clock = timestamps ? timer(gpu) : undefined;
  const measurements: Record<string, number>[] = [];
  clock?.onResults((results) => {
    measurements.push(results);
  });
  const inputId = workload === "pipeline-input" ? "benchmark-image" : undefined;
  const histogram = inputId ? createHistogram(gpu) : undefined;
  const combined =
    workload === "pipeline" ||
    workload === "pipeline-input" ||
    workload === "pipeline-proxy";
  const proxy = workload === "pipeline-proxy" || workload === "heal-proxy";
  const detail = combined || workload === "detail";
  const effects: ProcessingLayer[] = [];
  const common = { visible: true, opacity: 1, children: [] };
  if (detail) {
    effects.push({
      ...common,
      id: "benchmark-details",
      name: "Details",
      kind: "details",
      details: { clarity: 50, sharpening: 75, sharpenRadius: 1 },
    });
  }
  if (combined || workload === "color-mixer") {
    effects.push({
      ...common,
      id: "benchmark-mixer",
      name: "Color Mixer",
      kind: "color-mixer",
      colorMixer: {
        hue: new Array<number>(8).fill(20),
        saturation: new Array<number>(8).fill(25),
        luminance: new Array<number>(8).fill(10),
      },
    });
  }
  if (
    workload === "masked-exposure" ||
    workload === "radial-exposure" ||
    workload === "brush-exposure" ||
    workload === "layer-stack"
  ) {
    effects.push({
      ...common,
      id: "benchmark-gradient",
      name: "Gradient",
      kind: "mask",
      operation: "add",
      adjustments: defaultAdjustments,
      toneCurve: defaultCurve,
      opacity: 0.75,
      mask: benchmarkMask(workload, size),
      children: [
        {
          ...common,
          id: "benchmark-exposure",
          name: "Exposure",
          kind: "exposure",
          exposure: 1,
        },
      ],
    });
  }
  if (combined || workload === "vignette" || workload === "layer-stack") {
    effects.push({
      ...common,
      id: "benchmark-vignette",
      name: "Vignette",
      kind: "vignette",
      opacity: workload === "layer-stack" ? 0.6 : 1,
      vignette: { intensity: 80, softness: 60 },
    });
  }
  if (workload === "fill") {
    effects.push({
      ...common,
      id: "benchmark-fill",
      name: "Color",
      kind: "fill",
      opacity: 0.6,
      fill: { color: "#f0763c", blend: "soft-light" },
    });
  }
  if (
    workload === "heal" ||
    workload === "heal-empty" ||
    workload === "heal-proxy"
  ) {
    effects.push({
      ...common,
      id: "benchmark-heal",
      name: "Heal",
      kind: "heal",
      patches:
        workload === "heal-empty"
          ? []
          : [
              {
                id: "spot",
                algorithm: "clone",
                feather: 0.4,
                opacity: 1,
                stroke: {
                  mode: "paint",
                  size: 240,
                  feather: 0,
                  flow: 1,
                  points: [[size[0] / 2, size[1] / 2, 1]],
                },
                offset: [320, 0],
              },
            ],
    });
  }
  const scene: Scene = {
    frame: imageFrame(size),
    layers: [
      {
        ...createImageLayer("benchmark", "Benchmark"),
        id: "benchmark-image",
        adjustments: {
          ...defaultAdjustments,
          exposure: 0.25,
          contrast: 10,
        },
        toneCurve: combined
          ? [
              { x: 0, y: 0 },
              { x: 0.5, y: 0.6 },
              { x: 1, y: 1 },
            ]
          : defaultCurve,
      },
      ...effects,
    ],
  };
  function create(clock?: Timer) {
    const renderer = createEditorRenderer(gpu, source, clock);
    // Half a device pixel per source pixel, as a fitted view of a large photo, renders at a factor of 2.
    renderer.setDisplayScale(proxy ? 0.5 : 1);
    return renderer;
  }
  const setupStart = performance.now();
  let renderer = create();
  const rendererSetupMs = performance.now() - setupStart;
  async function measure() {
    const encoding: number[] = [];
    const completed: number[] = [];
    const totals: number[] = [];
    const nodes: Record<string, number[]> = {};
    for (let i = 0; i < warmup + samples; i++) {
      const start = performance.now();
      // A new scene object forces the render; the renderer skips a request equal to its last.
      await renderer.update({ ...scene }, inputId, proxy);
      const inspected = inputId && renderer.inputImage(inputId);
      if (inputId && !inspected) {
        throw Error("Missing benchmark curve input.");
      }
      const reading = inspected && histogram?.read(inspected, true, 1);
      const encoded = performance.now();
      await gpu.gpu.queue.onSubmittedWorkDone();
      const end = performance.now();
      await reading;
      await gpu.settled();
      const spans = measurements.pop();
      if (errors.length) {
        throw errors[0];
      }
      if (i >= warmup) {
        encoding.push(encoded - start);
        completed.push(end - start);
        if (spans) {
          totals.push(Object.values(spans).reduce((sum, ms) => sum + ms, 0));
          for (const [name, ms] of Object.entries(spans)) {
            nodes[name] ??= [];
            nodes[name].push(ms);
          }
        }
      }
    }
    return {
      cpuEncodeMs: summarize(encoding),
      completedMs: summarize(completed),
      gpuMs: totals.length ? summarize(totals) : null,
      nodes: Object.fromEntries(
        Object.entries(nodes).map(([name, values]) => [
          name,
          summarize(values),
        ]),
      ),
    };
  }
  try {
    // A deterministic linear Rec.2020 gradient spans saturated colors, neutrals, and HDR.
    const fill = effect(
      gpu,
      `
      @fragment fn fs_main(@builtin(position) p: vec4f) -> @location(0) vec4f {
        let uv = p.xy / vec2f(${size[0]}.0, ${size[1]}.0);
        let rgb = 0.5 + 0.5 * cos(uv.x * 6.2831853 + vec3f(0.0, -2.0943951, 2.0943951));
        return vec4f(mix(vec3f(0.18), rgb * 2.0, uv.y), 1.0);
      }`,
    );
    frame(gpu, (f) => f.pass(input, fill));
    await gpu.gpu.queue.onSubmittedWorkDone();
    const start = performance.now();
    await renderer.update({ ...scene }, inputId, proxy);
    await gpu.gpu.queue.onSubmittedWorkDone();
    await gpu.settled();
    const firstRenderMs = performance.now() - start;
    const rendering = await measure();
    const storage = renderer.inspect();
    const pixels = await renderer.outputImage().readFloats();
    if (!pixels.every(Number.isFinite)) {
      throw new Error("Benchmark output contains non-finite pixels.");
    }
    const pixelHash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", pixels.slice()),
    );
    const blob = await encodeImage(gpu, renderer.outputImage(), {
      longEdge: 960,
    });
    // Profile separately so timestamp queries/readback do not affect the latency comparison.
    renderer.dispose();
    renderer = create(clock);
    const profile = clock ? await measure() : null;
    return {
      workload,
      size,
      warmup,
      samples,
      timestamps,
      adapter: {
        vendor: adapter.info.vendor,
        architecture: adapter.info.architecture,
        device: adapter.info.device,
        description: adapter.info.description,
      },
      rendererSetupMs,
      firstRenderMs,
      rendering,
      profile,
      storage,
      pixelHash: [...pixelHash]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join(""),
      // Image targets use rgba16float. Source and driver memory are excluded.
      intermediateBytes: storage.textures.reduce(
        (sum, { size, format }) =>
          sum + size[0] * size[1] * (format === "rgba32float" ? 16 : 8),
        0,
      ),
      // Brush rasters are r8unorm at source resolution, outside the graph.
      rasterBytes: storage.rasters.reduce(
        (sum, { size }) => sum + size[0] * size[1],
        0,
      ),
      image: [...new Uint8Array(await blob.arrayBuffer())],
    };
  } finally {
    histogram?.dispose();
    renderer.dispose();
    source.dispose();
    clock?.dispose();
    gpu.dispose();
  }
}
