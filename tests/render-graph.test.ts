import { expect, spyOn, test } from "bun:test";
import { getMockGPUDeviceInstrumentation, init, target } from "vgpu/mock";
import {
  createRenderGraph,
  curveInput,
  input,
  merge,
  node,
  pipeline,
  type RenderImage,
  split,
} from "@/core/renderer";

const shader = `
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var base: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> weights: array<f32>;
@fragment fn fs_main(@builtin(position) p: vec4f) -> @location(0) vec4f {
  return mix(textureLoad(source, vec2i(p.xy), 0), textureLoad(base, vec2i(p.xy), 0), weights[0]);
}`;
const options = { storage: { weights: new Float32Array([0.5]) } };

function mixed(image: RenderImage, name: string, extra = {}) {
  return merge(
    { source: image, base: image },
    node(name, shader, { ...options, ...extra }),
  );
}
test("pipeline and split preserve order, bypasses, and named merge inputs", async () => {
  const gpu = await init();
  const image = target(gpu, { size: [8, 4], format: "rgba16float" });
  const source = input(image);
  const first = node("first", shader);
  const last = node("last", shader);
  const result = pipeline(source, [
    first,
    undefined,
    (image) => pipeline(image, [last]),
  ]);
  expect(result).toMatchObject({
    name: "last",
    inputs: { source: { name: "first", inputs: { source } } },
  });
  expect(pipeline(source, [undefined])).toBe(source);
  const [unchanged, small] = split(result, [
    [],
    [node("small", shader, { size: [2, 1] })],
  ]);
  expect(unchanged).toBe(result);
  expect(small).toMatchObject({ inputs: { source: result }, size: [2, 1] });
  const joined = merge({ base: source, source: small }, node("join", shader));
  expect(joined).toMatchObject({
    inputs: { base: source, source: small },
    size: [8, 4],
    format: "rgba16float",
  });
  expect(
    getMockGPUDeviceInstrumentation(gpu.gpu).calls.createRenderPipeline ?? 0,
  ).toBe(0);
  image.color.dispose();
  gpu.dispose();
});

test("a shared branch renders once and reuses effects, buffers, and temporary storage", async () => {
  const gpu = await init();
  const image = target(gpu, { size: [8, 8], format: "rgba16float" });
  const source = input(image);
  const graph = createRenderGraph(gpu);
  const shared = mixed(source, "shared");
  const branch = mixed(mixed(shared, "middle"), "branch");
  const joined = merge(
    { source: shared, base: branch },
    node("join", shader, options),
  );
  const uploads = spyOn(gpu.gpu.queue, "writeBuffer");
  const [saved, output] = graph.render([shared, joined]);
  expect(output).not.toBe(saved);
  expect(uploads).toHaveBeenCalledTimes(4);
  expect(graph.inspect().passes).toEqual([
    "shared",
    "middle",
    "branch",
    "join",
  ]);
  expect(graph.inspect().textures).toHaveLength(3);
  const calls = getMockGPUDeviceInstrumentation(gpu.gpu).calls;
  const buffers = calls.createBuffer;
  const pipelines = calls.createRenderPipeline;
  expect(graph.render([joined, shared, joined])).toEqual([
    output,
    saved,
    output,
  ]);
  expect(calls.createBuffer).toBe(buffers);
  expect(calls.createRenderPipeline).toBe(pipelines);
  // A storage array uploads once while passes keep receiving it.
  expect(uploads).toHaveBeenCalledTimes(4);
  // Bypassing releases scratch storage.
  expect(graph.render([shared])[0]).toBe(saved);
  expect(graph.inspect().textures).toHaveLength(1);
  expect(() => output.color.view).toThrow("destroyed");
  // Kept reductions keep their targets whichever way the zoom goes; a reduction not kept, the
  // photo's own size, goes once another renders, and a reduction's new sizes replace its old ones.
  const sized = (size: number) =>
    mixed(source, "shared", { size: [size, size] });
  const [proxy] = graph.render([sized(4)], { reduction: 2, kept: [2] });
  expect(proxy.size).toEqual([4, 4]);
  expect(() => saved.color.view).toThrow("destroyed");
  const [small] = graph.render([sized(2)], { reduction: 4, kept: [4, 2] });
  expect(graph.render([sized(4)], { reduction: 2, kept: [2, 4] })[0]).toBe(
    proxy,
  );
  const [full] = graph.render([shared], { reduction: 1, kept: [2, 4] });
  expect(graph.inspect().textures).toHaveLength(3);
  expect(graph.render([sized(2)], { reduction: 4, kept: [4, 2] })[0]).toBe(
    small,
  );
  expect(() => full.color.view).toThrow("destroyed");
  const [cropped] = graph.render([sized(3)], { reduction: 2, kept: [2, 4] });
  expect(() => proxy.color.view).toThrow("destroyed");
  expect(graph.render([sized(2)], { reduction: 4, kept: [4] })[0]).toBe(small);
  expect(() => cropped.color.view).toThrow("destroyed");
  expect(graph.inspect().textures).toHaveLength(1);
  // Removing a composition retires its cached effect so its name can be reused.
  graph.release("shared");
  const replacement = merge(
    { source, base: source },
    node("shared", shader.replace("weights[0]", "1.0 - weights[0]"), options),
  );
  expect(() => graph.render([replacement])).not.toThrow();
  // Passes with identical uniforms share one prepared binding state.
  const { effects } = graph.inspect();
  const first = mixed(source, "first", { instance: "twin" });
  graph.render([mixed(first, "second", { instance: "twin" })]);
  expect(graph.inspect()).toMatchObject({
    passes: ["first", "second"],
    effects: effects + 1,
  });
  graph.dispose();
  expect(() => image.color.view).not.toThrow();
  expect(() => graph.render([shared])).toThrow("closed");
  image.color.dispose();
  gpu.dispose();
});

test("a curve's input is drawn on the histogram's grid, standing for the whole photo", async () => {
  const gpu = await init();
  const grid = [512, 320] as const;
  const image = input(
    target(gpu, { size: [2048, 1536], format: "rgba16float" }),
  );
  const whole = curveInput("layer", image, grid);
  expect(whole.size).toEqual([512, 320]);
  expect(whole.scale).toEqual([4, 4.8]);
  const coverage = input(target(gpu, { size: [1024, 768], format: "r8unorm" }));
  const painted = curveInput("mask", image, grid, undefined, [], coverage);
  expect(painted.size).toEqual([512, 320]);
  // A smaller photo fills the grid too, its texels repeated as the histogram repeats them.
  const small = input(target(gpu, { size: [300, 200], format: "rgba16float" }));
  expect(curveInput("small", small, grid).size).toEqual([512, 320]);
});
