import {
  type Buffer,
  type Effect,
  effect,
  frame,
  type Gpu,
  sampler,
  type Target,
  type Timer,
  target,
} from "vgpu";
import type { RenderImage, RenderNode } from "./node";

type Pass = {
  shader: RenderNode["shader"];
  effect: Effect;
  /** Each storage buffer with the array it holds, so the same array is not uploaded again. */
  buffers: Map<string, { buffer: Buffer; data: Float32Array }>;
};

function plan(outputs: readonly RenderImage[]) {
  const uses = new Map<RenderImage, number>();
  const order: RenderNode[] = [];
  const live = new Set<Target>();
  const names = new Set<string>();
  function visit(image: RenderImage) {
    const count = uses.get(image) ?? 0;
    uses.set(image, count + 1);
    if (count) {
      return;
    }
    if (!("inputs" in image)) {
      live.add(image.target);
      return;
    }
    if (names.has(image.name)) {
      throw Error(`Duplicate render node: ${image.name}.`);
    }
    names.add(image.name);
    Object.values(image.inputs).forEach(visit);
    order.push(image);
  }
  // Requested outputs count as consumers, keeping their targets live.
  outputs.forEach(visit);
  return { order, uses, live };
}

const sizeKey = (image: { size: readonly number[]; format: string }) =>
  `${image.size[0]}x${image.size[1]} ${image.format}`;

/**
 * Which set of sizes a render belongs to, named by the caller, so its sizes replace the ones that
 * set used before, and the sets whose idle targets stay for the next render in them.
 */
export type Retention = {
  set: number;
  kept: readonly number[];
};

/** Owns effects, storage buffers, and transient targets for one renderer. */
export function createRenderGraph(gpu: Gpu, timer?: Timer) {
  const pool: Target[] = [];
  /**
   * How many targets of each size the latest render in each set used: the current set's and the kept
   * ones', so a zoom that returns to a kept set allocates nothing, which Safari penalizes.
   */
  const recent = new Map<number, Map<string, number>>();
  const effects = new Map<string, Pass>();
  let passes: string[] = [];
  let disposed = false;
  function prepare(node: RenderNode) {
    const instance = node.instance ?? node.name;
    let pass = effects.get(instance);
    if (!pass) {
      const bindings = Object.fromEntries(
        Object.entries(node.samplers ?? {}).map(([name, descriptor]) => [
          name,
          sampler(gpu, descriptor),
        ]),
      );
      pass = {
        shader: node.shader,
        effect: effect(gpu, node.shader, {
          label: node.name,
          set: bindings,
        }),
        buffers: new Map(),
      };
      effects.set(instance, pass);
    }
    if (pass.shader !== node.shader) {
      throw Error(`Render node ${node.name} changed shader; use a new name.`);
    }
    for (const [name, data] of Object.entries(node.storage ?? {})) {
      const stored = pass.buffers.get(name);
      if (stored?.data === data) {
        continue;
      }
      let buffer = stored?.buffer;
      if (!buffer || buffer.options.size !== data.byteLength) {
        buffer?.dispose();
        buffer = gpu.device.createBuffer({
          size: data.byteLength,
          usage: ["storage", "copy_dst"],
        });
        pass.effect.set({ [name]: buffer });
      }
      buffer.write(data);
      pass.buffers.set(name, { buffer, data });
    }
    return pass.effect;
  }
  function acquire(node: RenderNode, live: ReadonlySet<Target>) {
    const exact = pool.find(
      (image) =>
        !live.has(image) &&
        image.format === node.format &&
        image.size[0] === node.size[0] &&
        image.size[1] === node.size[1],
    );
    if (exact) {
      return exact;
    }
    const image = target(gpu, { size: node.size, format: node.format });
    pool.push(image);
    return image;
  }
  return {
    /** Retire removed composition instances; bypassed instances remain reusable. */
    release(prefix: string) {
      for (const [name, pass] of effects) {
        if (name.startsWith(prefix)) {
          for (const { buffer } of pass.buffers.values()) {
            buffer.dispose();
          }
          effects.delete(name);
        }
      }
    },
    render(outputs: readonly RenderImage[], { set, kept }: Retention) {
      if (disposed) {
        throw Error("Render graph is closed.");
      }
      const { order, uses, live } = plan(outputs);
      const results = new Map<RenderNode, Target>();
      function resolve(image: RenderImage): Target {
        if (!("inputs" in image)) {
          return image.target;
        }
        const result = results.get(image);
        if (!result) {
          throw Error(`Unrendered node: ${image.name}.`);
        }
        return result;
      }
      const written = new Set<Target>();
      frame(gpu, (frame) => {
        for (const node of order) {
          const pass = prepare(node);
          pass.set({
            ...node.set,
            ...Object.fromEntries(
              Object.entries(node.inputs).map(([name, image]) => [
                name,
                resolve(image).color,
              ]),
            ),
          });
          const output = acquire(node, live);
          live.add(output);
          written.add(output);
          frame.pass({ target: output, timer: timer?.span(node.name) }, pass);
          results.set(node, output);
          for (const input of Object.values(node.inputs)) {
            const remaining = (uses.get(input) ?? 0) - 1;
            uses.set(input, remaining);
            if (!remaining && "inputs" in input) {
              live.delete(resolve(input));
            }
          }
        }
      });
      const used = new Map<string, number>();
      for (const image of written) {
        used.set(sizeKey(image), (used.get(sizeKey(image)) ?? 0) + 1);
      }
      // The new counts replace the set's old ones, so an old crop size or the peak of an effect since
      // turned off is let go, and so is every set no longer kept.
      recent.set(set, used);
      for (const other of recent.keys()) {
        if (other !== set && !kept.includes(other)) {
          recent.delete(other);
        }
      }
      // Past these counts, an idle target is an old size or an old peak.
      const counted = new Map<string, number>();
      for (const image of pool) {
        if (written.has(image) || live.has(image)) {
          counted.set(sizeKey(image), (counted.get(sizeKey(image)) ?? 0) + 1);
        }
      }
      for (let i = pool.length - 1; i >= 0; i--) {
        const image = pool[i];
        if (written.has(image) || live.has(image)) {
          continue;
        }
        const key = sizeKey(image);
        const allowed = Math.max(
          ...[...recent.values()].map((counts) => counts.get(key) ?? 0),
        );
        const count = counted.get(key) ?? 0;
        if (count < allowed) {
          counted.set(key, count + 1);
          continue;
        }
        image.color.dispose();
        pool.splice(i, 1);
      }
      passes = order.map((node) => node.name);
      return outputs.map(resolve);
    },
    inspect() {
      return {
        passes: [...passes],
        effects: effects.size,
        textures: pool.map(({ size, format }) => ({
          size: [...size],
          format,
        })),
      };
    },
    dispose() {
      disposed = true;
      for (const pass of effects.values()) {
        for (const { buffer } of pass.buffers.values()) {
          buffer.dispose();
        }
      }
      effects.clear();
      for (const image of pool) {
        image.color.dispose();
      }
      pool.length = 0;
      recent.clear();
    },
  };
}
