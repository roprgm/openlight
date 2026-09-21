import { effect, frame, type Gpu, type Target, target } from "vgpu";
import { input, type RenderInput } from "@/core/renderer/node";
import shader from "./proxy.wgsl";

type Cached = {
  source: Target;
  factor: number;
  version: number;
  output: Target;
};

/** A reduced copy of the source for interactive rendering, kept until the source, factor, or version changes. */
export function createProxy(gpu: Gpu) {
  const reduce = effect(gpu, shader);
  let cached: Cached | undefined;
  return {
    render(source: Target, factor: number, version = 0): RenderInput {
      const size: [number, number] = [
        Math.max(1, Math.ceil(source.size[0] / factor)),
        Math.max(1, Math.ceil(source.size[1] / factor)),
      ];
      if (
        !cached ||
        cached.source !== source ||
        cached.factor !== factor ||
        cached.version !== version
      ) {
        let output = cached?.output;
        if (
          !output ||
          output.size[0] !== size[0] ||
          output.size[1] !== size[1] ||
          output.format !== source.format
        ) {
          output?.color.dispose();
          output = target(gpu, { size, format: source.format });
        }
        reduce.set({ source: source.color, factor });
        frame(gpu, (frame) => frame.pass(output, reduce));
        cached = { source, factor, version, output };
      }
      return input(cached.output, [
        source.size[0] / size[0],
        source.size[1] / size[1],
      ]);
    },
    dispose() {
      cached?.output.color.dispose();
      cached = undefined;
    },
  };
}
