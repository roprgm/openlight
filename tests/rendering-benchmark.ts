import { effect, frame, init, type Timer, target, timer } from "vgpu";
import { encodeImage } from "@/app/editor/export/export-image";
import { createImageLayer } from "@/app/editor/layers";
import { createEditorRenderer } from "@/app/editor/renderer";
import type {
  BrushStroke,
  HealPatch,
  LookupTable,
  Mask,
  ProcessingLayer,
  Scene,
  StrokePoint,
} from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import { defaultAdjustments } from "@/features/adjustments/model";
import { correct } from "@/features/crop/geometry";
import { createHistogram } from "@/features/histogram/histogram";
import { defaultCurve } from "@/features/tone-curves/curve";

export type Workload =
  | "neutral"
  | "color-mixer"
  | "vignette"
  | "grain"
  | "detail"
  | "pipeline"
  | "pipeline-input"
  | "masked-exposure"
  | "radial-exposure"
  | "brush-exposure"
  | "brush-group"
  | "luminance-range"
  | "color-range"
  | "layer-stack"
  | "fill"
  | "lut"
  | "paint"
  | "heal"
  | "clone"
  | "remove"
  | "heal-empty"
  | "heal-proxy"
  | "pipeline-proxy"
  | "perspective";

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

const pixelBytes: Record<string, number> = {
  r8unorm: 1,
  r16float: 2,
  rg16float: 4,
  rgba8unorm: 4,
  rgba16float: 8,
  rgba32float: 16,
};

/** Wavy strokes across the image, three painted and one erased. */
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
  if (workload === "brush-exposure" || workload === "brush-group") {
    return { kind: "brush", strokes: brushStrokes(size) };
  }
  // What the Add menu's range masks select at first: the brighter half, or a sky blue.
  if (workload === "luminance-range") {
    return { kind: "luminance-range", low: 50, high: 100, smoothness: 25 };
  }
  if (workload === "color-range") {
    return { kind: "color-range", color: "#6fa8dc", tolerance: 30 };
  }
  return {
    kind: "linear",
    start: [0, size[1] * 0.2],
    end: [0, size[1] * 0.8],
  };
}

/** A 33-point LUT that warms highlights and cools shadows, as a creative grade does. */
function benchmarkLut(): LookupTable {
  const size = 33;
  const table = Array.from({ length: size ** 3 }, (_, index) => {
    const r = (index % size) / (size - 1);
    const g = (Math.floor(index / size) % size) / (size - 1);
    const b = Math.floor(index / size ** 2) / (size - 1);
    return [r ** 0.9, g, b ** 1.1];
  }).flat();
  return {
    size,
    domain: [
      [0, 0, 0],
      [1, 1, 1],
    ],
    table,
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
    workload === "brush-group" ||
    workload === "luminance-range" ||
    workload === "color-range" ||
    workload === "layer-stack"
  ) {
    const mask = {
      adjustments: defaultAdjustments,
      toneCurve: defaultCurve,
      kind: "mask",
    } as const;
    effects.push({
      ...common,
      ...mask,
      id: "benchmark-gradient",
      name: "Gradient",
      operation: "add",
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
        // A brush that a gradient takes away from, so the group combines its children.
        ...(workload === "brush-group"
          ? [
              {
                ...common,
                ...mask,
                id: "benchmark-subtract",
                name: "Linear Gradient",
                operation: "subtract",
                mask: benchmarkMask("masked-exposure", size),
              } as const,
            ]
          : []),
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
  if (workload === "grain") {
    effects.push({
      ...common,
      id: "benchmark-grain",
      name: "Grain",
      kind: "grain",
      grain: { amount: 50, size: 25, roughness: 50 },
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
  if (workload === "lut") {
    effects.push({
      ...common,
      id: "benchmark-lut",
      name: "LUT",
      kind: "lut",
      lut: benchmarkLut(),
    });
  }
  if (workload === "paint") {
    effects.push({
      ...common,
      id: "benchmark-paint",
      name: "Paint",
      kind: "paint",
      blend: "soft-light",
      strokes: brushStrokes(size).map((stroke, index) => ({
        ...stroke,
        color: ["#f0763c", "#3c8ef0", "#f0d23c", "#000000"][index],
      })),
    });
  }
  if (
    workload === "heal" ||
    workload === "clone" ||
    workload === "remove" ||
    workload === "heal-empty" ||
    workload === "heal-proxy"
  ) {
    const shape = {
      id: "spot",
      feather: 0.4,
      opacity: 1,
      strokes: [
        {
          mode: "paint" as const,
          size: 240,
          feather: 0,
          flow: 1,
          points: [[size[0] / 2, size[1] / 2, 1] as const],
        },
      ],
    };
    const donorMode = workload === "clone" ? "clone" : "heal";
    const patch: HealPatch =
      workload === "remove"
        ? { ...shape, mode: "remove", field: "benchmark-heal" }
        : { ...shape, mode: donorMode, offset: [320, 0] };
    effects.push({
      ...common,
      id: "benchmark-heal",
      name: "Heal",
      kind: "heal",
      patches: workload === "heal-empty" ? [] : [patch],
    });
  }

  const scene: Scene = {
    // The neutral photo through a perspective correction, which the final transform resamples once.
    frame:
      workload === "perspective"
        ? correct(imageFrame(size), [40, -60], size)
        : imageFrame(size),
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
  // Half a device pixel per source pixel, as a fitted view of a large photo, renders at a factor of 2.
  const density = proxy ? 0.5 : 1;
  function create(clock?: Timer) {
    return createEditorRenderer(gpu, source, { timer: clock });
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
      await renderer.update({ ...scene }, inputId, proxy, undefined, density);
      const inspected = inputId && renderer.inputImage(inputId);
      if (inputId && !inspected) {
        throw Error("Missing benchmark curve input.");
      }
      const reading = inspected && histogram?.read(() => inspected, true, 1);
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
    await renderer.update({ ...scene }, inputId, proxy, undefined, density);
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
      // Source and driver memory are excluded.
      intermediateBytes: storage.textures.reduce(
        (sum, { size, format }) => sum + size[0] * size[1] * pixelBytes[format],
        0,
      ),
      // Brush rasters, paint, Remove fields, and the stroke buffer, outside the graph.
      rasterBytes: storage.rasters.reduce(
        (sum, { size, format }) => sum + size[0] * size[1] * pixelBytes[format],
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
