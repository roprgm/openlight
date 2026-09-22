import { expect, test } from "bun:test";
import { init, target } from "vgpu/mock";
import { exportImage } from "@/app/editor/export/export-image";
import { createImageLayer, createLayer } from "@/app/editor/layers";
import { createEditorRenderer } from "@/app/editor/renderer";
import {
  type BrushStroke,
  createDocument,
  createResources,
  findLayer,
} from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import { strokeDabs } from "@/core/renderer/mask/dabs";
import {
  addHealPatch,
  deleteHealPatch,
  duplicateHealPatch,
  extendHealPatch,
  setAiResult,
  setHealDestination,
  setHealPatch,
  setHealSource,
  settleAiResult,
} from "@/features/heal/edits";
import { createMiganSession, miganMaskDabs } from "@/features/heal/migan";
import { miganBounds } from "@/features/heal/model";
import { addLayer, deleteLayer } from "@/features/layers/edits";

test("MI-GAN adopts the editor device", async () => {
  let options: unknown;
  const session = {
    outputNames: [],
    run: async () => ({}),
    release: async () => {},
  };
  const runtime = {
    InferenceSession: {
      create(_bytes: ArrayBuffer, value: unknown) {
        options = value;
        return Promise.resolve(session);
      },
    },
  };
  const device = {};
  await expect(
    createMiganSession(runtime as never, new ArrayBuffer(0), device as never),
  ).resolves.toBe(session);
  expect(options).toMatchObject({
    executionProviders: [{ name: "webgpu", device }],
  });
});

test("heal patches reuse brush rasters, scale with the proxy, undo, and release with the layer", async () => {
  const gpu = await init();
  const source = createImageSource(
    target(gpu, { size: [256, 192], format: "rgba16float" }),
  );
  const resources = createResources();
  const sourceId = resources.add(new File([], "photo.png"), source);
  const document = createDocument(
    {
      frame: imageFrame(source.image.size),
      layers: [createImageLayer(sourceId, "Photo")],
    },
    resources,
  );
  const renderer = createEditorRenderer(gpu, source);
  try {
    const id = addLayer(document, createLayer("heal"));
    const stroke: BrushStroke = {
      mode: "paint",
      size: 30,
      feather: 0.4,
      flow: 1,
      points: [[100, 80, 1]],
    };
    document.history.begin();
    const patch = addHealPatch(document, id, stroke, [60, 0]);
    const created = document.scene
      .getState()
      .layers.find((item) => item.id === id);
    expect(
      created?.kind === "heal" &&
        created.patches.find((item) => item.id === patch),
    ).toMatchObject({ feather: 0.4, stroke: { size: 30, feather: 0 } });
    renderer.setDisplayScale(0.25);
    await renderer.update(document.scene.getState(), id, true);
    expect(renderer.fullImage().size).toEqual([64, 48]);
    expect(renderer.inspect().rasters).toEqual([
      { id: `layer/${id}/${patch}`, size: [256, 192] },
    ]);
    const stamped = renderer.inspect().stamped;
    extendHealPatch(document, id, [[120, 80, 1]]);
    await renderer.update(document.scene.getState(), id, true);
    expect(renderer.inspect().stamped).toBeGreaterThan(stamped);
    const extended = renderer.inspect().stamped;
    document.history.commit();
    await renderer.update(document.scene.getState());
    expect(renderer.fullImage().size).toEqual([256, 192]);
    expect(renderer.inspect().stamped).toBe(extended);
    expect(renderer.inspect().passes.at(-1)).toBe(`layer/${id}/${patch}/blend`);
    expect(renderer.inspect().passes.length).toBeGreaterThan(1);
    expect(renderer.inspect().effects).toBeLessThan(15);
    const textures = renderer.inspect().textures;
    setHealSource(document, id, patch, [70, 0]);
    await renderer.update(document.scene.getState());
    expect(renderer.inspect().textures).toEqual(textures);
    expect(renderer.inspect().stamped).toBe(extended);
    document.history.undo();
    document.history.undo();
    await renderer.update(document.scene.getState());
    expect(renderer.inspect().rasters).toEqual([]);
    expect(renderer.inspect().passes).toEqual([]);
    document.history.redo();
    await renderer.update(document.scene.getState());
    expect(renderer.inspect().rasters).toHaveLength(1);
    expect(() =>
      addHealPatch(document, id, { ...stroke, mode: "erase" }, [1, 2]),
    ).toThrow("painted");
    expect(() =>
      addHealPatch(document, id, stroke, [1, 2], "other" as never),
    ).toThrow("Smart clone or AI Remove");
    expect(() => setHealSource(document, id, patch, [NaN, 0])).toThrow(
      "finite",
    );
    expect(() => setHealPatch(document, id, patch, { feather: NaN })).toThrow(
      "feather",
    );
    setHealSource(document, id, patch, [0, 0]);
    await renderer.update(document.scene.getState());
    expect(renderer.inspect().effects).toBe(0);
    expect(renderer.inspect().rasters).toEqual([]);
    deleteLayer(document, id);
    await renderer.update(document.scene.getState());
    expect(renderer.inspect().rasters).toEqual([]);
  } finally {
    renderer.dispose();
    document.dispose();
    gpu.dispose();
  }
});

test("one Healing layer composes Smart clone and AI patches through render nodes", async () => {
  const gpu = await init();
  const resources = createResources();
  const source = createImageSource(
    target(gpu, { size: [128, 96], format: "rgba16float" }),
  );
  const sourceId = resources.add(new File([], "photo.png"), source);
  const document = createDocument(
    {
      frame: imageFrame(source.image.size),
      layers: [createImageLayer(sourceId, "Photo")],
    },
    resources,
  );
  const renderer = createEditorRenderer(
    gpu,
    source,
    undefined,
    (id) => resources.get(id).image,
  );
  try {
    const layer = addLayer(document, createLayer("heal"));
    const stroke: BrushStroke = {
      mode: "paint",
      size: 24,
      feather: 0.4,
      flow: 1,
      points: [[64, 48, 1]],
    };
    const smart = addHealPatch(document, layer, stroke, [30, 0], "clone");
    const patch = addHealPatch(document, layer, stroke, [0, 0], "ai");
    const generated = createImageSource(
      target(gpu, { size: [512, 512], format: "rgba16float" }),
    );
    const result = resources.add(new File([], "result"), generated);
    setAiResult(document, layer, patch, {
      source: result,
      origin: [16, 0],
      extent: [96, 96],
    });
    await renderer.update(document.scene.getState(), layer);
    expect(renderer.inspect().passes).toContain(
      `layer/${layer}/${patch}/migan`,
    );
    expect(renderer.inspect().passes).toContain(
      `layer/${layer}/${smart}/blend`,
    );
    expect(renderer.inputImage(layer)).toBeDefined();
    expect(renderer.inputImage(layer)).not.toBe(source.image);
    const layerInput = renderer.inputImage(layer);
    await renderer.update(document.scene.getState(), patch);
    expect(renderer.inputImage(patch)).toBeDefined();
    expect(renderer.inputImage(patch)).not.toBe(layerInput);
    const correctionGraph = renderer.inspect();
    setHealDestination(document, layer, smart, [80, 60]);
    setHealDestination(document, layer, patch, [70, 55]);
    setHealPatch(document, layer, smart, {
      feather: 0.2,
      opacity: 0.6,
    });
    await renderer.update(document.scene.getState(), patch);
    expect(renderer.inspect().passes).toEqual(correctionGraph.passes);
    expect(renderer.inspect().textures).toEqual(correctionGraph.textures);
    const copy = duplicateHealPatch(document, layer, smart);
    let healing = document.scene
      .getState()
      .layers.find((item) => item.id === layer);
    expect(healing?.kind).toBe("heal");
    if (healing?.kind !== "heal") throw Error("Healing layer missing.");
    expect(healing.patches.find((item) => item.id === smart)).toMatchObject({
      stroke: { points: [[80, 60, 1]] },
      offset: [14, -12],
    });
    expect(healing.patches.find((item) => item.id === patch)).toMatchObject({
      stroke: { points: [[70, 55, 1]] },
      result: { origin: [16, 0], extent: [96, 96] },
      stale: true,
    });
    expect(healing.patches.find((item) => item.id === smart)).toMatchObject({
      feather: 0.2,
      opacity: 0.6,
      stroke: { size: 24, feather: 0 },
    });
    expect(healing.patches.find((item) => item.id === copy)?.algorithm).toBe(
      "clone",
    );
    setAiResult(document, layer, patch, {
      source: result,
      origin: [16, 0],
      extent: [96, 96],
    });
    healing = document.scene
      .getState()
      .layers.find((item) => item.id === layer);
    expect(healing?.kind === "heal" && healing.patches[1]).not.toHaveProperty(
      "stale",
    );
    deleteHealPatch(document, layer, copy);
    healing = document.scene
      .getState()
      .layers.find((item) => item.id === layer);
    expect(healing?.kind === "heal" && healing.patches).toHaveLength(2);
    const beforeRegeneration = document.scene.getState();
    document.history.clear();
    setHealSource(document, layer, smart, [20, 0]);
    const regenerated = resources.add(
      new File([], "regenerated"),
      createImageSource(
        target(gpu, { size: [512, 512], format: "rgba16float" }),
      ),
    );
    settleAiResult(document, layer, patch, {
      source: regenerated,
      origin: [16, 0],
      extent: [96, 96],
    });
    expect(document.history.status.getState().undoCount).toBe(1);
    document.history.undo();
    expect(document.scene.getState()).toBe(beforeRegeneration);
  } finally {
    renderer.dispose();
    document.dispose();
    gpu.dispose();
  }
});

function healFixture(size: readonly [number, number] = [64, 64]) {
  const resources = createResources();
  const document = createDocument(
    {
      frame: imageFrame(size),
      layers: [createImageLayer("source", "Photo")],
    },
    resources,
  );
  const layer = addLayer(document, createLayer("heal"));
  return { document, layer };
}

const dab: BrushStroke = {
  mode: "paint",
  size: 8,
  feather: 0,
  flow: 1,
  points: [[10, 10, 1]],
};

function patchesOf(document: ReturnType<typeof createDocument>, layer: string) {
  const healing = findLayer(document.scene.getState().layers, layer);
  if (healing?.kind !== "heal") throw Error("Healing layer missing.");
  return healing.patches;
}

test("export resolves a finished AI patch before encoding", async () => {
  const gpu = await init();
  const resources = createResources();
  const source = createImageSource(
    target(gpu, { size: [32, 24], format: "rgba16float" }),
  );
  const sourceId = resources.add(new File([], "photo.png"), source);
  const document = createDocument(
    {
      frame: imageFrame(source.image.size),
      layers: [createImageLayer(sourceId, "Photo")],
    },
    resources,
  );
  try {
    const layer = addLayer(document, createLayer("heal"));
    const patch = addHealPatch(document, layer, dab, [0, 0], "ai");
    const generated = createImageSource(
      target(gpu, { size: [8, 8], format: "rgba16float" }),
    );
    setAiResult(document, layer, patch, {
      source: resources.add(new File([], "result"), generated),
      origin: [0, 0],
      extent: [32, 24],
    });
    // The mock has no canvas encoder, so composition failing on the resource is the only earlier error.
    await expect(exportImage(gpu, document)).rejects.toThrow(/OffscreenCanvas/);
  } finally {
    document.dispose();
    gpu.dispose();
  }
});

test("a gesture during a finishing stroke joins its undo step", () => {
  const { document, layer } = healFixture();
  try {
    expect(document.history.begin()).toBe(true);
    const patch = addHealPatch(document, layer, dab, [0, 0]);
    // A slider or handle finds the group open and leaves it to the stroke.
    expect(document.history.begin()).toBe(false);
    setHealPatch(document, layer, patch, { feather: 0.5 });
    setHealSource(document, layer, patch, [6, -2]);
    document.history.commit();
    expect(document.history.status.getState()).toMatchObject({
      undoCount: 2,
      editing: false,
    });
    expect(patchesOf(document, layer)[0]).toMatchObject({
      feather: 0.5,
      offset: [6, -2],
    });
    document.history.undo();
    expect(patchesOf(document, layer)).toHaveLength(0);
  } finally {
    document.dispose();
  }
});

test("editing an earlier patch marks a generating AI patch stale", () => {
  const { document, layer } = healFixture();
  try {
    const first = addHealPatch(document, layer, dab, [1, 1]);
    const pending = addHealPatch(document, layer, dab, [0, 0], "ai");
    setHealPatch(document, layer, pending, { feather: 0.5 });
    expect(patchesOf(document, layer)[1]).not.toHaveProperty("stale");
    setHealPatch(document, layer, first, { opacity: 0.5 });
    expect(patchesOf(document, layer)[1]).toMatchObject({ stale: true });
  } finally {
    document.dispose();
  }
});

test("MI-GAN covers every dab and keeps context on the short axis", () => {
  const dot: BrushStroke = {
    mode: "paint",
    size: 20,
    feather: 1,
    flow: 1,
    points: [[100, 100, 1]],
  };
  const square = miganBounds(dot, [2000, 2000]);
  expect(square.extent).toEqual([512, 512]);
  const [painted] = miganMaskDabs(dot, square);
  expect(painted?.rx).toBeCloseTo((dot.size / 2) * (512 / square.extent[0]));
  expect(miganMaskDabs({ ...dot, points: [[100, 100, 0]] }, square)).toEqual(
    [],
  );
  const scratch: BrushStroke = {
    mode: "paint",
    size: 30,
    feather: 0.4,
    flow: 1,
    points: [
      [10, 900, 1],
      [3900, 900, 0.4],
    ],
  };
  const region = miganBounds(scratch, [4000, 1600]);
  expect(region.extent[1]).toBe(1600);
  for (const [x, y, radius] of strokeDabs(scratch)) {
    expect(Math.max(0, x - radius)).toBeGreaterThanOrEqual(region.origin[0]);
    expect(Math.max(0, y - radius)).toBeGreaterThanOrEqual(region.origin[1]);
    expect(Math.min(4000, x + radius)).toBeLessThanOrEqual(
      region.origin[0] + region.extent[0],
    );
  }
  const mask = miganMaskDabs(scratch, region);
  expect(mask.every((item) => item.x >= 0 && item.x <= 512)).toBe(true);
});
