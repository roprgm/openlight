import { expect, test } from "bun:test";
import { init, target } from "vgpu/mock";
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
import {
  addHealPatch,
  deleteHealPatch,
  duplicateHealPatch,
  extendHealPatch,
  setHealDestination,
  setHealPatch,
  setHealSource,
} from "@/features/heal/edits";
import { addLayer, deleteLayer } from "@/features/layers/edits";

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
    expect(() => setHealSource(document, id, patch, [NaN, 0])).toThrow(
      "Invalid heal source",
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

test("one Healing layer composes its patches in order through render nodes", async () => {
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
  const renderer = createEditorRenderer(gpu, source);
  try {
    const layer = addLayer(document, createLayer("heal"));
    const stroke: BrushStroke = {
      mode: "paint",
      size: 24,
      feather: 0.4,
      flow: 1,
      points: [[64, 48, 1]],
    };
    const first = addHealPatch(document, layer, stroke, [30, 0]);
    const second = addHealPatch(document, layer, stroke, [-30, 0]);
    await renderer.update(document.scene.getState(), layer);
    expect(renderer.inspect().passes).toContain(
      `layer/${layer}/${first}/blend`,
    );
    expect(renderer.inspect().passes).toContain(
      `layer/${layer}/${second}/blend`,
    );
    await renderer.update(document.scene.getState(), first);
    const firstInput = renderer.inputImage(first);
    expect(firstInput).toBeDefined();
    // A later patch sees the result of the earlier ones.
    await renderer.update(document.scene.getState(), second);
    expect(renderer.inputImage(second)).toBeDefined();
    expect(renderer.inputImage(second)).not.toBe(firstInput);
    const correctionGraph = renderer.inspect();
    setHealDestination(document, layer, first, [80, 60]);
    setHealPatch(document, layer, first, { feather: 0.2, opacity: 0.6 });
    await renderer.update(document.scene.getState(), second);
    expect(renderer.inspect().passes).toEqual(correctionGraph.passes);
    expect(renderer.inspect().textures).toEqual(correctionGraph.textures);
    const copy = duplicateHealPatch(document, layer, first);
    expect(patchesOf(document, layer)).toMatchObject([
      {
        id: first,
        stroke: { points: [[80, 60, 1]], size: 24, feather: 0 },
        offset: [14, -12],
        feather: 0.2,
        opacity: 0.6,
      },
      { id: copy, offset: [14, -12] },
      { id: second },
    ]);
    deleteHealPatch(document, layer, copy);
    expect(patchesOf(document, layer).map((patch) => patch.id)).toEqual([
      first,
      second,
    ]);
  } finally {
    renderer.dispose();
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
