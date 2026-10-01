import { effect, frame, init, target } from "vgpu";
import { encodeImage } from "@/app/editor/export/export-image";
import { createImageLayer, createLayer } from "@/app/editor/layers";
import { createEditorRenderer } from "@/app/editor/renderer";
import type { HealPatch, Scene } from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";

export type InpaintFixture =
  | "flat"
  | "gradient"
  | "texture"
  | "edge"
  | "structure";

/** Known backgrounds make removal measurable, including cases that cannot be inferred locally. */
export async function renderInpaintReference(
  fixture: InpaintFixture,
  diameter = 32,
  proxy = false,
) {
  const gpu = await init();
  const errors: string[] = [];
  gpu.onError((error) => errors.push(error.message));
  const size: [number, number] = [192, 144];
  const image = target(gpu, { size, format: "rgba16float" });
  const clean = target(gpu, { size, format: "rgba16float" });
  const source = createImageSource(image);
  const renderer = createEditorRenderer(gpu, source);
  const backgrounds: Record<InpaintFixture, string> = {
    flat: "vec3f(0.25, 0.55, 1.4)",
    gradient: "vec3f(0.25 + p.x * 0.002, 0.3 + p.y * 0.001, 1.4)",
    texture:
      "vec3f(0.3, 0.5, 0.7) + 0.12 * sin(p.x * 0.785398) * cos(p.y * 0.785398)",
    edge: "select(vec3f(0.2, 0.35, 0.6), vec3f(0.65, 0.5, 0.3), p.y >= 72.0)",
    structure:
      "select(vec3f(0.55, 0.22, 0.12), vec3f(0.75), (u32(p.y) % 24u < 2u) || (u32(p.x + f32(u32(p.y) / 24u % 2u) * 24.0) % 48u < 2u))",
  };
  const shader = (defect: boolean) =>
    effect(
      gpu,
      `
    struct Params { damaged: u32, radius: f32 }
    @group(0) @binding(0) var<uniform> params: Params;
    @fragment fn fs_main(@builtin(position) p: vec4f) -> @location(0) vec4f {
      let background = ${backgrounds[fixture]};
      let defect = params.damaged != 0u && distance(p.xy, vec2f(96.0, 72.0)) < params.radius;
      return vec4f(select(background, vec3f(0.015), defect), 0.75);
    }
  `,
      { set: { params: { damaged: Number(defect), radius: diameter / 2 } } },
    );
  const patch: HealPatch = {
    id: "object",
    mode: "remove",
    feather: 0,
    opacity: 1,
    stroke: {
      mode: "paint",
      size: diameter + 8,
      feather: 0,
      flow: 1,
      points: [[96, 72, 1]],
    },
  };
  const healing = { ...createLayer("heal"), patches: [patch] };
  const scene: Scene = {
    frame: imageFrame(size),
    layers: [createImageLayer("source", "Reference"), healing],
  };
  try {
    frame(gpu, (f) => {
      f.pass(image, shader(true));
      f.pass(clean, shader(false));
    });
    await gpu.gpu.queue.onSubmittedWorkDone();
    renderer.setDisplayScale(0.5);
    const start = performance.now();
    await renderer.update(scene, undefined, proxy);
    await gpu.gpu.queue.onSubmittedWorkDone();
    const completedMs = performance.now() - start;
    const solved = renderer.inspect();
    const result = renderer.fullImage();
    const actual = await result.readFloats();
    const before = await image.readFloats();
    const expected = await clean.readFloats();
    let errorBefore = 0;
    let errorAfter = 0;
    let count = 0;
    let outsideError = 0;
    let alphaError = 0;
    const scale = size[0] / result.size[0];
    for (let y = 0; y < result.size[1]; y++) {
      for (let x = 0; x < result.size[0]; x++) {
        const px = Math.floor((x + 0.5) * scale);
        const py = Math.floor((y + 0.5) * scale);
        const index = (y * result.size[0] + x) * 4;
        const reference = (py * size[0] + px) * 4;
        const distance = Math.hypot(px - 96, py - 72);
        for (let channel = 0; channel < 3; channel++) {
          if (distance < diameter / 2 - 2) {
            errorBefore += Math.abs(
              before[reference + channel] - expected[reference + channel],
            );
            errorAfter += Math.abs(
              actual[index + channel] - expected[reference + channel],
            );
            count++;
          } else if (!proxy && distance > diameter / 2 + 6) {
            outsideError = Math.max(
              outsideError,
              Math.abs(actual[index + channel] - before[reference + channel]),
            );
          }
        }
        alphaError = Math.max(alphaError, Math.abs(actual[index + 3] - 0.75));
      }
    }
    const images = await Promise.all(
      [image, result, clean].map(async (target) => [
        ...new Uint8Array(await (await encodeImage(gpu, target)).arrayBuffer()),
      ]),
    );
    await renderer.update(
      { ...scene, layers: [scene.layers[0], { ...healing, visible: false }] },
      undefined,
      proxy,
    );
    const hiddenCaches = renderer.inspect().cachedTextures.length;
    await renderer.update(scene, undefined, proxy);
    const shown = renderer.inspect();
    const visible = await renderer.fullImage().readFloats();
    const visibilityError = visible.reduce(
      (maximum, value, index) =>
        Math.max(maximum, Math.abs(value - actual[index])),
      0,
    );
    await renderer.update(
      {
        ...scene,
        layers: [
          scene.layers[0],
          { ...healing, patches: [{ ...patch, opacity: 0.5 }] },
        ],
      },
      undefined,
      proxy,
    );
    const cached = renderer.inspect();
    await renderer.update(
      {
        ...scene,
        layers: [
          {
            ...scene.layers[0],
            adjustments: { ...scene.layers[0].adjustments, exposure: 0.5 },
          },
          healing,
        ],
      },
      undefined,
      proxy,
    );
    const changed = renderer.inspect();
    await renderer.update(
      {
        ...scene,
        layers: [
          {
            ...scene.layers[0],
            adjustments: { ...scene.layers[0].adjustments, exposure: 1 },
          },
          healing,
        ],
      },
      undefined,
      proxy,
    );
    await renderer.update(scene, undefined, proxy);
    const restored = await renderer.fullImage().readFloats();
    const restoredError = restored.reduce(
      (maximum, value, index) =>
        Math.max(maximum, Math.abs(value - actual[index])),
      0,
    );
    await renderer.update({ ...scene, layers: [scene.layers[0]] });
    const released = renderer.inspect();
    await gpu.settled();
    return {
      fixture,
      diameter,
      proxy,
      completedMs,
      beforeError: errorBefore / count,
      afterError: errorAfter / count,
      outsideError,
      alphaError,
      restoredError,
      visibilityError,
      hiddenCaches,
      shownSolverPasses: shown.passes.filter((name) =>
        name.includes("/inpaint/"),
      ).length,
      finite: actual.every(Number.isFinite),
      errors,
      images,
      solverPasses: solved.passes.filter((name) => name.includes("/inpaint/"))
        .length,
      cachedSolverPasses: cached.passes.filter((name) =>
        name.includes("/inpaint/"),
      ).length,
      changedSolverPasses: changed.passes.filter((name) =>
        name.includes("/inpaint/"),
      ).length,
      releasedCaches: released.cachedTextures.length,
    };
  } finally {
    renderer.dispose();
    source.dispose();
    clean.color.dispose();
    gpu.dispose();
  }
}
