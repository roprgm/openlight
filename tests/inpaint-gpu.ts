import { effect, frame, init, target } from "vgpu";
import { encodeImage } from "@/app/editor/export/export-image";
import { createImageLayer, createLayer } from "@/app/editor/layers";
import { createEditorRenderer } from "@/app/editor/renderer";
import type { FieldRecord, HealPatch, Scene } from "@/core/document";
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
    field: "object",
    feather: 0,
    opacity: 1,
    strokes: [
      {
        mode: "paint",
        size: diameter + 8,
        feather: 0,
        flow: 1,
        points: [[96, 72, 1]],
      },
    ],
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
    // Only full resolution synthesizes; a proxy then shows the field it keeps.
    await renderer.update(scene);
    await gpu.gpu.queue.onSubmittedWorkDone();
    const completedMs = performance.now() - start;
    const solved = renderer.inspect();
    await renderer.update(scene, undefined, proxy);
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
    const fields = () =>
      renderer.inspect().rasters.filter(({ id }) => id.endsWith("/field"))
        .length;
    const hiddenFields = fields();
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
    const exposed = renderer.inspect();
    // The patch keeps its donors, whose colors follow the exposure below it.
    const brighter = await renderer.fullImage().readFloats();
    let exposedError = 0;
    for (let index = 0; index < brighter.length; index += 4) {
      const x = (index / 4) % result.size[0];
      const y = Math.floor(index / 4 / result.size[0]);
      const px = Math.floor((x + 0.5) * scale);
      const py = Math.floor((y + 0.5) * scale);
      if (Math.hypot(px - 96, py - 72) >= diameter / 2 - 2) continue;
      const reference = (py * size[0] + px) * 4;
      for (let channel = 0; channel < 3; channel++) {
        exposedError += Math.abs(
          brighter[index + channel] - expected[reference + channel] * 2 ** 0.5,
        );
      }
    }
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
    const releasedFields = fields();
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
      exposedError: exposedError / count,
      hiddenFields,
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
      exposedSolverPasses: exposed.passes.filter((name) =>
        name.includes("/inpaint/"),
      ).length,
      releasedFields,
    };
  } finally {
    renderer.dispose();
    source.dispose();
    clean.color.dispose();
    gpu.dispose();
  }
}

/**
 * A Remove patch over two spots on noise, where any other donor shows: a stroke added to it, or one
 * erasing part of it, leaves what it filled as it was and synthesizes only the rest.
 */
export async function renderInpaintExtension() {
  const gpu = await init();
  const errors: string[] = [];
  gpu.onError((error) => errors.push(error.message));
  const size: [number, number] = [192, 144];
  const image = target(gpu, { size, format: "rgba16float" });
  const source = createImageSource(image);
  // Each stroke count is a version with its own field, extending the one before, as edits reserve them.
  const fields = ["spots/1", "spots/2", "spots/3"];
  const records = new Map<string, FieldRecord>([
    [fields[0], {}],
    [fields[1], { base: fields[0] }],
    [fields[2], { base: fields[1] }],
  ]);
  const renderer = createEditorRenderer(gpu, source, {
    field: (id) => records.get(id),
  });
  const first = [56, 72] as const;
  const second = [140, 72] as const;
  const erased = [48, 72] as const;
  const stroke = (
    mode: "paint" | "erase",
    [x, y]: readonly [number, number],
    diameter: number,
  ) =>
    ({
      mode,
      size: diameter,
      feather: 0,
      flow: 1,
      points: [[x, y, 1]],
    }) as const;
  const strokes = [
    stroke("paint", first, 32),
    stroke("paint", second, 32),
    stroke("erase", erased, 12),
  ];
  const healing = createLayer("heal");
  const scene = (count: number): Scene => ({
    frame: imageFrame(size),
    layers: [
      createImageLayer("source", "Spots"),
      {
        ...healing,
        patches: [
          {
            id: "spots",
            mode: "remove",
            field: fields[count - 1],
            feather: 0,
            opacity: 1,
            strokes: strokes.slice(0, count),
          },
        ],
      },
    ],
  });
  try {
    frame(gpu, (f) =>
      f.pass(
        image,
        effect(
          gpu,
          `
      @fragment fn fs_main(@builtin(position) p: vec4f) -> @location(0) vec4f {
        let noise = fract(sin(dot(floor(p.xy), vec2f(12.9898, 78.233))) * 43758.5453);
        let spot = distance(p.xy, vec2f(${first.join(", ")})) < 12.0 || distance(p.xy, vec2f(${second.join(", ")})) < 12.0;
        return vec4f(select(vec3f(0.3 + 0.2 * noise, 0.4, 0.5), vec3f(0.015), spot), 1.0);
      }
    `,
        ),
      ),
    );
    const renders = [];
    for (const count of [1, 2, 3]) {
      await renderer.update(scene(count));
      renders.push({
        pixels: await renderer.fullImage().readFloats(),
        solved: renderer
          .inspect()
          .passes.some((name) => name.includes("/inpaint/")),
      });
    }
    const original = await image.readFloats();
    // The largest change in red between two renders over the pixels `within` selects.
    function change(
      a: Float32Array,
      b: Float32Array,
      within: (x: number, y: number) => boolean,
    ) {
      let largest = 0;
      for (let index = 0; index < a.length; index += 4) {
        const x = ((index / 4) % size[0]) + 0.5;
        const y = Math.floor(index / 4 / size[0]) + 0.5;
        if (within(x, y))
          largest = Math.max(largest, Math.abs(a[index] - b[index]));
      }
      return largest;
    }
    const near =
      ([cx, cy]: readonly [number, number], radius: number) =>
      (x: number, y: number) =>
        Math.hypot(x - cx, y - cy) < radius;
    const [filled, extended, subtracted] = renders.map(({ pixels }) => pixels);
    return {
      errors,
      solved: renders.map(({ solved }) => solved),
      // The first spot, as the first stroke filled it.
      keptByAdding: change(filled, extended, near(first, 14)),
      keptByErasing: change(
        filled,
        subtracted,
        (x, y) => near(first, 14)(x, y) && !near(erased, 8)(x, y),
      ),
      // The second spot was dark before the stroke over it, and the erased part is again.
      secondFilled: Math.min(
        ...[...extended].filter(
          (_, index) =>
            index % 4 === 0 &&
            near(second, 10)(
              ((index / 4) % size[0]) + 0.5,
              Math.floor(index / 4 / size[0]) + 0.5,
            ),
        ),
      ),
      erasedRestored: change(original, subtracted, near(erased, 4)),
    };
  } finally {
    renderer.dispose();
    source.dispose();
    gpu.dispose();
  }
}
