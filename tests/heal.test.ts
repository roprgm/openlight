import { expect, spyOn, test } from "bun:test";
import { init, target } from "vgpu/mock";
import { createImageLayer, createLayer, createMask } from "@/app/editor/layers";
import { createEditorRenderer } from "@/app/editor/renderer";
import {
  type BrushStroke,
  createDocument,
  createResources,
  findLayer,
  removePatches,
} from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import { createRenderGraph, type FieldLattice, input } from "@/core/renderer";
import { setAdjustments } from "@/features/adjustments/edits";
import {
  addHealPatch,
  addHealStroke,
  addRemovePatch,
  deleteHealPatch,
  duplicateHealPatch,
  extendHealPatch,
  setHealDestination,
  setHealPatch,
  setHealSource,
} from "@/features/heal/edits";
import { inpaintField } from "@/features/heal/inpaint";
import { watchRemoveFields } from "@/features/heal/save-fields";
import { addLayer, deleteLayer, setLayer } from "@/features/layers/edits";

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

test("Remove passes never overwrite distinct uniforms before their frame submits", async () => {
  const gpu = await init();
  const source = target(gpu, { size: [64, 64], format: "rgba16float" });
  const coverage = target(gpu, { size: [64, 64], format: "r8unorm" });
  const base = target(gpu, { size: [64, 64], format: "rg16float" });
  const graph = createRenderGraph(gpu);
  const uploads = spyOn(gpu.gpu.queue, "writeBuffer");
  const lattice = { origin: [0, 0], scale: 1, size: source.size } as const;
  try {
    graph.render([
      inpaintField(
        input(source),
        { coverage: input(coverage), origin: [0, 0] },
        lattice,
        "remove",
        { texels: input(base), lattice },
      ),
    ]);
    const uniforms = new Map<GPUBuffer, Uint8Array>();
    for (const [buffer, , data] of uploads.mock.calls) {
      const bytes = ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : new Uint8Array(data);
      const previous = uniforms.get(buffer);
      if (previous) expect(bytes).toEqual(previous);
      uniforms.set(buffer, bytes.slice());
    }
    expect(uniforms.size).toBeGreaterThan(1);
  } finally {
    uploads.mockRestore();
    graph.dispose();
    base.color.dispose();
    coverage.color.dispose();
    source.color.dispose();
    gpu.dispose();
  }
});

test("patch strokes add, erase, replay on undo, and move together while retaining the donor", async () => {
  const gpu = await init();
  const source = createImageSource(
    target(gpu, { size: [1024, 1024], format: "rgba16float" }),
  );
  const { document, layer } = healFixture([1024, 1024]);
  const renderer = createEditorRenderer(gpu, source);
  try {
    const id = addHealPatch(document, layer, dab, [20, 0], "clone");
    await renderer.update(document.scene.getState());
    expect(renderer.inspect().stamped).toBe(1);
    addHealStroke(document, layer, id, { ...dab, points: [[30, 30, 1]] });
    await renderer.update(document.scene.getState());
    expect(renderer.inspect().stamped).toBe(2);
    addHealStroke(document, layer, id, { ...dab, mode: "erase", size: 1000 });
    await renderer.update(document.scene.getState());
    // Erasure outside the patch never grows its raster or repeats earlier dabs.
    expect(renderer.inspect().stamped).toBe(3);
    expect(renderer.inspect().rasters[0].size).toEqual([256, 256]);
    await renderer.update(document.scene.getState());
    expect(renderer.inspect().stamped).toBe(3);
    document.history.undo();
    await renderer.update(document.scene.getState());
    expect(renderer.inspect().stamped).toBe(5);
    document.history.redo();
    await renderer.update(document.scene.getState());
    expect(renderer.inspect().stamped).toBe(6);
    setHealDestination(document, layer, id, [20, 25]);
    expect(patchesOf(document, layer)).toMatchObject([
      {
        id,
        mode: "clone",
        offset: [10, -15],
        strokes: [
          { mode: "paint", points: [[20, 25, 1]] },
          { mode: "paint", points: [[40, 45, 1]] },
          { mode: "erase", points: [[20, 25, 1]] },
        ],
      },
    ]);
  } finally {
    renderer.dispose();
    document.dispose();
    source.dispose();
    gpu.dispose();
  }
});

test("Remove patches edit, move, duplicate, and undo without a donor", () => {
  const { document, layer } = healFixture();
  try {
    document.history.begin();
    const patch = addRemovePatch(document, layer, { ...dab, feather: 0.3 });
    extendHealPatch(document, layer, [[12, 14, 1]]);
    document.history.commit();
    setHealPatch(document, layer, patch, { opacity: 0.5 });
    setHealDestination(document, layer, patch, [20, 30]);
    const copy = duplicateHealPatch(document, layer, patch);
    expect(patchesOf(document, layer)).toMatchObject([
      {
        id: patch,
        mode: "remove",
        opacity: 0.5,
        feather: 0.3,
        strokes: [
          {
            points: [
              [20, 30, 1],
              [22, 34, 1],
            ],
          },
        ],
      },
      { id: copy, mode: "remove" },
    ]);
    expect(patchesOf(document, layer)[0]).not.toHaveProperty("offset");
    expect(() => setHealSource(document, layer, patch, [10, 10])).toThrow(
      "no donor",
    );
    document.history.undo();
    expect(patchesOf(document, layer)).toHaveLength(1);
    document.history.undo();
    document.history.undo();
    document.history.undo();
    expect(patchesOf(document, layer)).toHaveLength(0);
    document.history.redo();
    expect(patchesOf(document, layer)[0].mode).toBe("remove");
  } finally {
    document.dispose();
  }
});

function patchesOf(document: ReturnType<typeof createDocument>, layer: string) {
  const healing = findLayer(document.scene.getState().layers, layer);
  if (healing?.kind !== "heal") throw Error("Healing layer missing.");
  return healing.patches;
}

test("a nested Remove synthesizes once for its strokes, whatever changes below or hides it, and extends on new strokes", async () => {
  const gpu = await init();
  const source = createImageSource(
    target(gpu, { size: [128, 96], format: "rgba16float" }),
  );
  const { document } = healFixture([128, 96]);
  const renderer = createEditorRenderer(gpu, source);
  const mask = addLayer(
    document,
    createMask({ kind: "linear", start: [0, 0], end: [0, 96] }),
  );
  const layer = addLayer(document, createLayer("heal"), { inside: mask });
  const patch = addRemovePatch(document, layer, {
    ...dab,
    points: [[64, 48, 1]],
  });
  const render = (interactive = false) =>
    renderer.update(document.scene.getState(), undefined, interactive);
  const solves = () =>
    renderer.inspect().passes.some((name) => name.includes("/inpaint/"));
  const fields = () =>
    renderer.inspect().rasters.filter(({ id }) => id.endsWith("/field"));
  try {
    await render();
    expect(solves()).toBe(true);
    expect(fields()).toMatchObject([{ id: `${layer}/${patch}/field` }]);
    setHealPatch(document, layer, patch, { opacity: 0.5, feather: 0.4 });
    await render();
    expect(solves()).toBe(false);
    for (const id of [layer, mask]) {
      for (const change of [{ visible: false }, { opacity: 0 }]) {
        setLayer(document, id, change);
        await render();
        expect(fields()).toHaveLength(1);
        setLayer(document, id, { visible: true, opacity: 1 });
        await render();
        expect(solves()).toBe(false);
      }
    }
    setLayer(document, mask, { opacity: 0.5 });
    setAdjustments(document, { exposure: 1 }, mask);
    await render();
    expect(solves()).toBe(false);
    renderer.setDisplayScale(0.5);
    await render(true);
    expect(solves()).toBe(false);
    for (const mode of ["paint", "erase"] as const) {
      addHealStroke(document, layer, patch, {
        ...dab,
        mode,
        size: 2,
        points: [[64, 48, 1]],
      });
      // A proxy keeps the field it holds; only full resolution synthesizes the new stroke.
      await render(true);
      expect(solves()).toBe(false);
      await render();
      expect(solves()).toBe(true);
      setHealPatch(document, layer, patch, {
        opacity: mode === "paint" ? 0.6 : 0.5,
      });
      await render();
      expect(solves()).toBe(false);
    }
    setHealDestination(document, layer, patch, [40, 40]);
    await render();
    expect(solves()).toBe(true);
    deleteLayer(document, mask);
    await render();
    expect(fields()).toEqual([]);
  } finally {
    renderer.dispose();
    document.dispose();
    source.dispose();
    gpu.dispose();
  }
});

test("Remove fields save once no gesture is open, a stroke added during a readback takes its field as a base, and snapshots wait for a readback", async () => {
  const { document, layer } = healFixture();
  // A renderer whose renders the test runs, and whose readbacks finish, oldest first, when it says.
  let render = () => {};
  const reads: (() => void)[] = [];
  const renderer = {
    subscribe(listener: () => void) {
      render = listener;
      return () => {};
    },
    readField: () =>
      new Promise<{ texels: Blob; lattice: FieldLattice }>((resolve) =>
        reads.push(() =>
          resolve({
            texels: new Blob(["field"]),
            lattice: { origin: [0, 0], scale: 1, size: [8, 8] },
          }),
        ),
      ),
  };
  async function finish() {
    reads.shift()?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const patches = () =>
    [...removePatches(document.scene.getState().layers)].map(
      ({ patch }) => patch,
    );
  const first = addRemovePatch(document, layer, dab);
  addRemovePatch(document, layer, dab);
  const { undoCount } = document.history.status.getState();
  const stop = watchRemoveFields(document, renderer);
  try {
    // A gesture drops the readback that finishes inside it and reads nothing more until it ends.
    render();
    document.history.begin();
    await finish();
    expect(reads).toHaveLength(0);
    expect(patches().map(({ field }) => field)).toEqual([undefined, undefined]);
    // Its end saves both fields, with no undo step.
    document.history.commit();
    await finish();
    await finish();
    expect(patches().map(({ field }) => field?.strokes)).toEqual([1, 1]);
    expect(document.history.status.getState().undoCount).toBe(undoCount);

    addHealStroke(document, layer, first, dab);
    addHealStroke(document, layer, first, dab);
    await finish();
    expect(patches()[0].strokes).toHaveLength(3);
    expect(patches()[0].field?.strokes).toBe(2);
    // The field for every stroke is being read back, and a snapshot waits for it.
    const snapshot = document
      .replaced()
      .then(() => patches()[0].field?.strokes);
    await finish();
    expect(await snapshot).toBe(3);
  } finally {
    stop();
    document.dispose();
  }
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
    ).toMatchObject({ feather: 0.4, strokes: [{ size: 30, feather: 0 }] });
    renderer.setDisplayScale(0.25);
    await renderer.update(document.scene.getState(), id, true);
    expect(renderer.fullImage().size).toEqual([64, 48]);
    expect(renderer.inspect().rasters).toEqual([
      { id: `layer/${id}/${patch}`, size: [256, 192], format: "r8unorm" },
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

test("a heal patch's raster covers only the tiles its stroke reaches, growing with it", async () => {
  const gpu = await init();
  const source = createImageSource(
    target(gpu, { size: [2048, 1536], format: "rgba16float" }),
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
  const raster = () => renderer.inspect().rasters.map(({ size }) => size);
  try {
    const id = addLayer(document, createLayer("heal"));
    document.history.begin();
    addHealPatch(
      document,
      id,
      { ...dab, size: 30, points: [[1000, 700, 1]] },
      [80, 0],
    );
    await renderer.update(document.scene.getState(), undefined, true);
    // One 256 px tile rather than the whole photo.
    expect(raster()).toEqual([[256, 256]]);
    extendHealPatch(document, id, [[1100, 700, 1]]);
    await renderer.update(document.scene.getState(), undefined, true);
    expect(raster()).toEqual([[512, 256]]);
    document.history.commit();
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
    const second = addHealPatch(document, layer, stroke, [-30, 0], "clone");
    expect(patchesOf(document, layer).map((patch) => patch.mode)).toEqual([
      "heal",
      "clone",
    ]);
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
    expect(
      correctionGraph.passes.filter((name) =>
        name.startsWith(`layer/${layer}/${second}/`),
      ),
    ).toEqual([`layer/${layer}/${second}/blend`]);
    setHealDestination(document, layer, first, [80, 60]);
    setHealPatch(document, layer, first, { feather: 0.2, opacity: 0.6 });
    await renderer.update(document.scene.getState(), second);
    expect(renderer.inspect().passes).toEqual(correctionGraph.passes);
    expect(renderer.inspect().textures).toEqual(correctionGraph.textures);
    const copy = duplicateHealPatch(document, layer, first);
    expect(patchesOf(document, layer)).toMatchObject([
      {
        id: first,
        strokes: [{ points: [[80, 60, 1]], size: 24, feather: 0 }],
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
