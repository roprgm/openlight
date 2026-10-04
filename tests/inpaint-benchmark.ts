import { effect, frame, init, type Timer, target, timer } from "vgpu";
import { createImageLayer, createLayer } from "@/app/editor/layers";
import { createEditorRenderer } from "@/app/editor/renderer";
import type { BrushStroke, Scene } from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import { createRenderGraph, input } from "@/core/renderer";
import { createPatchRaster } from "@/core/renderer/mask/patches";
import { createStrokes } from "@/core/renderer/strokes";
import { inpaint } from "@/features/heal/inpaint";
import { patchBounds } from "@/features/heal/model";

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

/** Recompute a moving removal, isolated or composed, without React or image decoding in the timings. */
export async function benchmarkInpaint(
  scope: "solver" | "editor",
  warmup = 8,
  samples = 40,
) {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw Error("WebGPU is unavailable.");
  const timestamps = adapter.features.has("timestamp-query");
  const gpu = await init({
    requiredFeatures: timestamps ? ["timestamp-query"] : [],
  });
  const errors: string[] = [];
  gpu.onError((error) => errors.push(error.message));
  const size: [number, number] = [2400, 1600];
  const image = target(gpu, { size, format: "rgba16float" });
  const source = createImageSource(image);
  const base = createImageLayer("source", "Benchmark");
  const clock = timestamps ? timer(gpu) : undefined;
  const measurements: Record<string, number>[] = [];
  clock?.onResults((spans) => measurements.push(spans));
  function strokeAt(index: number): BrushStroke {
    return {
      mode: "paint",
      size: 240,
      feather: 0,
      flow: 1,
      points: [[1200 + (index % 2), 800, 1]],
    };
  }
  function create(clock?: Timer) {
    if (scope === "editor") {
      const editor = createEditorRenderer(gpu, source, { timer: clock });
      return {
        async render(index: number) {
          const scene: Scene = {
            frame: imageFrame(size),
            layers: [
              base,
              {
                ...createLayer("heal"),
                id: "heal",
                patches: [
                  {
                    id: "spot",
                    mode: "remove",
                    // Each render's stroke is a new version, which synthesizes its own field.
                    field: `spot/${index}`,
                    feather: 0.4,
                    opacity: 1,
                    strokes: [strokeAt(index)],
                  },
                ],
              },
            ],
          };
          await editor.update(scene);
        },
        inspect: editor.inspect,
        dispose: editor.dispose,
      };
    }
    const graph = createRenderGraph(gpu, clock);
    const strokes = createStrokes(gpu);
    const raster = createPatchRaster(gpu, strokes);
    return {
      async render(index: number) {
        const stroke = strokeAt(index);
        const coverage = raster.patch("spot", [stroke], size);
        graph.render(
          [
            inpaint(
              input(image),
              coverage,
              patchBounds([stroke], size, 240),
              "inpaint",
            ),
          ],
          { set: 1, kept: [] },
        );
      },
      inspect: graph.inspect,
      dispose() {
        graph.dispose();
        raster.dispose();
        strokes.dispose();
      },
    };
  }
  let engine = create();
  async function measure() {
    const encoded: number[] = [];
    const completed: number[] = [];
    const duration: number[] = [];
    for (let index = 0; index < warmup + samples; index++) {
      const start = performance.now();
      await engine.render(index);
      const submitted = performance.now();
      await gpu.gpu.queue.onSubmittedWorkDone();
      const end = performance.now();
      await gpu.settled();
      const spans = measurements.pop();
      if (errors.length) throw Error(errors[0]);
      if (index < warmup) continue;
      encoded.push(submitted - start);
      completed.push(end - start);
      if (spans)
        duration.push(Object.values(spans).reduce((sum, ms) => sum + ms, 0));
    }
    return {
      cpuEncodeMs: summarize(encoded),
      completedMs: summarize(completed),
      gpuMs: duration.length ? summarize(duration) : null,
    };
  }
  try {
    const fill = effect(
      gpu,
      `
      @fragment fn fs_main(@builtin(position) p: vec4f) -> @location(0) vec4f {
        return vec4f(0.2 + p.x / 4000.0, 0.3 + p.y / 3000.0, 1.4, 1.0);
      }
    `,
    );
    frame(gpu, (f) => f.pass(image, fill));
    await gpu.gpu.queue.onSubmittedWorkDone();
    const start = performance.now();
    await engine.render(0);
    await gpu.gpu.queue.onSubmittedWorkDone();
    const firstRenderMs = performance.now() - start;
    const rendering = await measure();
    const storage = engine.inspect();
    engine.dispose();
    engine = create(clock);
    const profile = clock ? await measure() : null;
    return {
      scope,
      size,
      diameter: 240,
      gridLimit: 512,
      warmup,
      samples,
      timestamps,
      adapter: {
        vendor: adapter.info.vendor,
        architecture: adapter.info.architecture,
        device: adapter.info.device,
        description: adapter.info.description,
      },
      firstRenderMs,
      rendering,
      profile,
      storage,
    };
  } finally {
    engine.dispose();
    source.dispose();
    clock?.dispose();
    gpu.dispose();
  }
}
