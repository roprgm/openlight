import { expect, test } from "bun:test";
import { init, target } from "vgpu/mock";
import { createImageLayer, createLayer } from "@/app/editor/layers";
import { createEditorRenderer } from "@/app/editor/renderer";
import {
  type BrushStroke,
  createDocument,
  createResources,
} from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
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
import { createMiganSession } from "@/features/heal/migan";
import { addLayer, deleteLayer } from "@/features/layers/edits";

test("MI-GAN shares the editor device and releases a cancelled session", async () => {
  let finish: ((session: { release(): Promise<void> }) => void) | undefined;
  let options: unknown;
  let released = false;
  const session = {
    async release() {
      released = true;
    },
  };
  const runtime = {
    InferenceSession: {
      create(_bytes: ArrayBuffer, value: unknown) {
        options = value;
        return new Promise<typeof session>((resolve) => {
          finish = resolve;
        });
      },
    },
  };
  const device = {};
  const controller = new AbortController();
  const loading = createMiganSession(
    runtime as never,
    new ArrayBuffer(0),
    device as never,
    controller.signal,
  );
  controller.abort();
  finish?.(session);
  await expect(loading).rejects.toThrow();
  expect(options).toMatchObject({
    executionProviders: [{ name: "webgpu", device }],
  });
  expect(released).toBe(true);
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
