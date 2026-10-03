import { effect, frame, init, target } from "vgpu";
import { encodeImage } from "@/app/editor/export/export-image";
import { createImageLayer, createLayer } from "@/app/editor/layers";
import { createEditorRenderer } from "@/app/editor/renderer";
import {
  createDocument,
  createResources,
  type HealPatch,
  type Scene,
} from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import { addHealStroke, addRemovePatch } from "@/features/heal/edits";
import { addLayer } from "@/features/layers/edits";

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
 * A Remove patch over a dark bar on noise whose first stroke stops short of the bar's tip: a stroke
 * added over the tip, and one erasing part of the patch, each synthesize the whole new shape, as
 * painting it at once does, so nothing of the bar stays.
 */
export async function renderInpaintReshape() {
  const gpu = await init();
  const errors: string[] = [];
  gpu.onError((error) => errors.push(error.message));
  const size: [number, number] = [192, 144];
  const image = target(gpu, { size, format: "rgba16float" });
  const source = createImageSource(image);
  const resources = createResources();
  const document = createDocument(
    {
      frame: imageFrame(size),
      layers: [
        createImageLayer(resources.add(new File([], "bar.png"), source), "Bar"),
      ],
    },
    resources,
  );
  // The editor's renderer keeps each version's field in the document; another paints shapes at once.
  const renderer = createEditorRenderer(gpu, source, {
    field: (id) => document.resources.field(id),
    saveField: (id, field) => document.resources.fillField(id, field),
  });
  const fresh = createEditorRenderer(gpu, source);
  const stroke = (
    mode: "paint" | "erase",
    from: readonly [number, number],
    to: readonly [number, number],
    diameter: number,
  ) =>
    ({
      mode,
      size: diameter,
      feather: 0,
      flow: 1,
      points: [
        [from[0], from[1], 1],
        [to[0], to[1], 1],
      ],
    }) as const;
  const erased = [70, 60] as const;
  const strokes = [
    stroke("paint", [40, 72], [118, 72], 28),
    stroke("paint", [118, 72], [156, 72], 28),
    stroke("erase", erased, erased, 8),
  ];
  try {
    frame(gpu, (f) =>
      f.pass(
        image,
        effect(
          gpu,
          `
      @fragment fn fs_main(@builtin(position) p: vec4f) -> @location(0) vec4f {
        let noise = fract(sin(dot(floor(p.xy), vec2f(12.9898, 78.233))) * 43758.5453);
        let bar = p.x >= 40.0 && p.x <= 150.0 && abs(p.y - 72.0) < 6.0;
        return vec4f(select(vec3f(0.3 + 0.2 * noise, 0.4, 0.5), vec3f(0.015), bar), 1.0);
      }
    `,
        ),
      ),
    );
    const original = await image.readFloats();
    // Each stroke edits the patch as the editor does, and every version renders as it is reached.
    const layer = addLayer(document, createLayer("heal"));
    const patch = addRemovePatch(document, layer, strokes[0]);
    const reshaped = [];
    for (const next of [undefined, strokes[1], strokes[2]]) {
      if (next) addHealStroke(document, layer, patch, next);
      await renderer.update(document.scene.getState());
      reshaped.push(await renderer.fullImage().readFloats());
    }
    // The same shapes painted at once: the scene of each version, rendered with no field held.
    const atOnce = [];
    for (const count of [2, 3]) {
      const scene = document.scene.getState();
      const [, healing] = scene.layers;
      if (healing.kind !== "heal") throw Error("The Healing layer is gone.");
      const [painted] = healing.patches;
      if (painted?.mode !== "remove") throw Error("The Remove patch is gone.");
      await fresh.update({
        ...scene,
        layers: [
          scene.layers[0],
          {
            ...healing,
            patches: [
              {
                ...painted,
                field: `at-once/${count}`,
                strokes: painted.strokes.slice(0, count),
              },
            ],
          },
        ],
      });
      atOnce.push(await fresh.fullImage().readFloats());
    }
    /** The red of each pixel `within` selects. */
    function reds(
      pixels: Float32Array,
      within: (x: number, y: number) => boolean,
    ) {
      const selected = [];
      for (let index = 0; index < pixels.length; index += 4) {
        const x = ((index / 4) % size[0]) + 0.5;
        const y = Math.floor(index / 4 / size[0]) + 0.5;
        if (within(x, y)) selected.push(pixels[index]);
      }
      return selected;
    }
    function change(a: Float32Array, b: Float32Array) {
      return Math.max(...a.map((value, index) => Math.abs(value - b[index])));
    }
    const bar = (x: number, y: number) =>
      x >= 40 && x <= 150 && Math.abs(y - 72) < 6;
    const tip = (x: number, y: number) => bar(x, y) && x > 136;
    const near = (x: number, y: number) =>
      Math.hypot(x - erased[0], y - erased[1]) < 3;
    const [first, added, subtracted] = reshaped;
    return {
      errors,
      missedTip: Math.min(...reds(first, tip)),
      barLeft: Math.min(...reds(added, bar)),
      added: change(added, atOnce[0]),
      erased: change(subtracted, atOnce[1]),
      erasedRestored: change(
        new Float32Array(reds(original, near)),
        new Float32Array(reds(subtracted, near)),
      ),
    };
  } finally {
    renderer.dispose();
    fresh.dispose();
    document.dispose();
    gpu.dispose();
  }
}
