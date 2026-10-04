import { effect, frame, type Gpu, type Target, target } from "vgpu";
import { input, type RenderInput } from "@/core/renderer/node";
import shader from "./proxy.wgsl";

type Cached = {
  source: Target;
  version: number;
  /** The reduced copy at each factor rendered, so a zoom that returns to a factor allocates nothing. */
  outputs: Map<number, Target>;
};

/** Reduced copies of the source, which renders at the display's density read, kept until swept or until the source or version changes. */
export function createProxy(gpu: Gpu) {
  const reduce = effect(gpu, shader);
  let cached: Cached | undefined;
  function clear() {
    for (const output of cached?.outputs.values() ?? []) {
      output.color.dispose();
    }
    cached = undefined;
  }
  /** A reduced copy of `source` at `factor`, rendered now. */
  function reduceTo(source: Target, factor: number) {
    const output = target(gpu, {
      size: [
        Math.max(1, Math.ceil(source.size[0] / factor)),
        Math.max(1, Math.ceil(source.size[1] / factor)),
      ],
      format: source.format,
    });
    reduce.set({ source: source.color, factor });
    frame(gpu, (frame) => frame.pass(output, reduce));
    return output;
  }
  return {
    render(source: Target, factor: number, version = 0): RenderInput {
      if (cached?.source !== source || cached.version !== version) {
        clear();
        cached = { source, version, outputs: new Map() };
      }
      const output = cached.outputs.get(factor) ?? reduceTo(source, factor);
      cached.outputs.set(factor, output);
      return input(output, [
        source.size[0] / output.size[0],
        source.size[1] / output.size[1],
      ]);
    },
    /** Lets go of the copies at every factor but `kept`. */
    sweep(kept: readonly number[]) {
      for (const [factor, output] of cached?.outputs ?? []) {
        if (!kept.includes(factor)) {
          output.color.dispose();
          cached?.outputs.delete(factor);
        }
      }
    },
    dispose: clear,
  };
}
