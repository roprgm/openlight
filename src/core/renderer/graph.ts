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
import type { CacheKey, RenderImage, RenderNode } from "./node";

type Pass = {
  shader: RenderNode["shader"];
  effect: Effect;
  /** Each storage buffer with the array it holds, so the same array is not uploaded again. */
  buffers: Map<string, { buffer: Buffer; data: Float32Array }>;
};

type Cached = { keys: readonly CacheKey[]; target: Target };

function sameKeys(a: readonly CacheKey[], b: readonly CacheKey[]) {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

function plan(
  outputs: readonly RenderImage[],
  caches: ReadonlyMap<string, Cached[]>,
) {
  const uses = new Map<RenderImage, number>();
  const order: RenderNode[] = [];
  const live = new Set<Target>();
  const names = new Set<string>();
  const results = new Map<RenderNode, Target>();
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
    const keys = image.cacheKeys;
    const cached =
      keys &&
      caches
        .get(image.name)
        ?.find(
          (cached) =>
            sameKeys(cached.keys, keys) &&
            cached.target.format === image.format &&
            cached.target.size[0] === image.size[0] &&
            cached.target.size[1] === image.size[1],
        );
    if (cached) {
      live.add(cached.target);
      results.set(image, cached.target);
      return;
    }
    Object.values(image.inputs).forEach(visit);
    order.push(image);
  }
  // Requested outputs count as consumers, keeping their targets live.
  outputs.forEach(visit);
  return { order, uses, live, results };
}

const sizeKey = (image: { size: readonly number[]; format: string }) =>
  `${image.size[0]}x${image.size[1]} ${image.format}`;

/** Owns effects, storage buffers, transient targets, and cached results for one renderer. */
export function createRenderGraph(gpu: Gpu, timer?: Timer) {
  const pool: Target[] = [];
  /**
   * How many targets of each size the last two distinct sets of sizes used, most recent first. An
   * interactive proxy and the full image alternate between two such sets, and keeping both saves
   * reallocating full-size targets on every gesture, which a phone's GPU memory can't absorb.
   */
  let recent: Map<string, number>[] = [];
  const effects = new Map<string, Pass>();
  const caches = new Map<string, Cached[]>();
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
  function acquireCached(node: RenderNode, live: ReadonlySet<Target>) {
    const entries = caches.get(node.name);
    const oldest = entries?.length === 2 ? entries.pop() : undefined;
    if (oldest) {
      if (
        !live.has(oldest.target) &&
        sizeKey(oldest.target) === sizeKey(node)
      ) {
        return oldest.target;
      }
      // An evicted result can still be an input to this frame; the pool respects its lifetime.
      pool.push(oldest.target);
    }
    return target(gpu, { size: node.size, format: node.format });
  }
  return {
    /** Retire removed composition instances; bypassed instances remain reusable. */
    release(prefix: string) {
      for (const [name, entries] of caches) {
        if (!name.startsWith(prefix)) continue;
        for (const { target } of entries) target.color.dispose();
        caches.delete(name);
      }
      for (const [name, pass] of effects) {
        if (name.startsWith(prefix)) {
          for (const { buffer } of pass.buffers.values()) {
            buffer.dispose();
          }
          effects.delete(name);
        }
      }
    },
    render(outputs: readonly RenderImage[]) {
      if (disposed) {
        throw Error("Render graph is closed.");
      }
      const { order, uses, live, results } = plan(outputs, caches);
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
          const output = node.cacheKeys
            ? acquireCached(node, live)
            : acquire(node, live);
          live.add(output);
          if (!node.cacheKeys) written.add(output);
          frame.pass({ target: output, timer: timer?.span(node.name) }, pass);
          if (node.cacheKeys) {
            const entries = caches.get(node.name) ?? [];
            entries.unshift({ keys: node.cacheKeys, target: output });
            caches.set(node.name, entries);
          }
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
      // Sizes that one set contains of the other are the same mode with more or fewer effects: the new
      // counts replace the old, so the peak of an effect since turned off is let go.
      const contains = (a: Map<string, number>, b: Map<string, number>) =>
        [...b.keys()].every((key) => a.has(key));
      const sameMode = (counts: Map<string, number>) =>
        contains(counts, used) || contains(used, counts);
      recent = [used, ...recent.filter((counts) => !sameMode(counts))].slice(
        0,
        2,
      );
      // Past these counts, an idle target is an old crop size or an old peak.
      const kept = new Map<string, number>();
      for (const image of pool) {
        if (written.has(image) || live.has(image)) {
          kept.set(sizeKey(image), (kept.get(sizeKey(image)) ?? 0) + 1);
        }
      }
      for (let i = pool.length - 1; i >= 0; i--) {
        const image = pool[i];
        if (written.has(image) || live.has(image)) {
          continue;
        }
        const key = sizeKey(image);
        const allowed = Math.max(
          ...recent.map((counts) => counts.get(key) ?? 0),
        );
        const count = kept.get(key) ?? 0;
        if (count < allowed) {
          kept.set(key, count + 1);
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
        cachedTextures: [...caches.values()].flatMap((entries) =>
          entries.map(({ target }) => ({
            size: [...target.size],
            format: target.format,
          })),
        ),
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
      for (const entries of caches.values()) {
        for (const { target } of entries) target.color.dispose();
      }
      caches.clear();
      for (const image of pool) {
        image.color.dispose();
      }
      pool.length = 0;
      recent = [];
    },
  };
}
