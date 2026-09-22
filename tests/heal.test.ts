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
  discardPendingHealPatch,
  duplicateHealPatch,
  extendHealPatch,
  finishAiResult,
  finishHealSource,
  setAiResult,
  setHealDestination,
  setHealPatch,
  setHealSource,
  settleAiResult,
} from "@/features/heal/edits";
import { createMiganSession, miganMaskDabs } from "@/features/heal/migan";
import { miganBounds } from "@/features/heal/model";
import { createPreparationGate, createRunQueue } from "@/features/heal/session";
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
    const result = resources.add(new File([], "result"), generated);
    setAiResult(document, layer, patch, {
      source: result,
      origin: [0, 0],
      extent: [32, 24],
    });
    const outcome = await exportImage(gpu, document).then(
      (file) => file,
      (reason: unknown) => reason,
    );
    if (outcome instanceof File) {
      expect(outcome.type).toBe("image/png");
    } else {
      expect(String(outcome)).toContain("OffscreenCanvas");
    }
  } finally {
    document.dispose();
    gpu.dispose();
  }
});

test("a donor lands in the stroke's own history entry", () => {
  const { document, layer } = healFixture();
  try {
    document.history.begin();
    const patch = addHealPatch(document, layer, dab, [0, 0]);
    finishHealSource(document, layer, patch, [4, 1]);
    expect(document.history.status.getState().editing).toBe(true);
    document.history.commit();
    const committed = document.history.status.getState().undoCount;
    document.history.begin();
    const later = addHealPatch(document, layer, dab, [0, 0]);
    document.history.commit();
    finishHealSource(document, layer, later, [6, -2]);
    expect(document.history.status.getState().undoCount).toBe(committed + 1);
    expect(patchesOf(document, layer)[1]).toMatchObject({ offset: [6, -2] });
    document.history.undo();
    expect(patchesOf(document, layer)).toHaveLength(1);
  } finally {
    document.dispose();
  }
});

test("an unfinished automatic stroke is dropped without a new undo step", () => {
  const { document, layer } = healFixture();
  try {
    document.history.begin();
    const patch = addHealPatch(document, layer, dab, [0, 0]);
    document.history.commit();
    const edits = document.history.status.getState().undoCount;
    discardPendingHealPatch(document, layer, patch, true);
    expect(patchesOf(document, layer)).toHaveLength(0);
    expect(document.history.status.getState().undoCount).toBe(edits);
    const kept = addHealPatch(document, layer, dab, [0, 0]);
    discardPendingHealPatch(document, layer, kept, false);
    expect(patchesOf(document, layer)).toHaveLength(1);
    const ai = addHealPatch(document, layer, dab, [0, 0], "ai");
    discardPendingHealPatch(document, layer, ai, false);
    expect(patchesOf(document, layer).some((item) => item.id === ai)).toBe(
      false,
    );
  } finally {
    document.dispose();
  }
});

test("AI results amend a closed stroke and stay inside an open one", () => {
  const { document, layer } = healFixture();
  try {
    document.history.begin();
    const patch = addHealPatch(document, layer, dab, [0, 0], "ai");
    document.history.commit();
    const edits = document.history.status.getState().undoCount;
    finishAiResult(document, layer, patch, {
      source: "result",
      origin: [1, 2],
      extent: [8, 8],
    });
    expect(document.history.status.getState().undoCount).toBe(edits);
    expect(patchesOf(document, layer)[0]).toMatchObject({
      result: { source: "result", origin: [1, 2] },
    });
    document.history.undo();
    expect(patchesOf(document, layer)).toHaveLength(0);
  } finally {
    document.dispose();
  }
});

test("MI-GAN covers every dab, using a square only when it fits", () => {
  const dot: BrushStroke = {
    mode: "paint",
    size: 20,
    feather: 1,
    flow: 1,
    points: [[100, 100, 1]],
  };
  expect(miganBounds(dot, [2000, 2000]).extent).toEqual([512, 512]);
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
  expect(region.extent[0]).toBeGreaterThan(region.extent[1]);
  for (const [x, y, radius, alpha] of strokeDabs(scratch)) {
    if (alpha <= 0) continue;
    expect(Math.max(0, x - radius)).toBeGreaterThanOrEqual(region.origin[0]);
    expect(Math.max(0, y - radius)).toBeGreaterThanOrEqual(region.origin[1]);
    expect(Math.min(4000, x + radius)).toBeLessThanOrEqual(
      region.origin[0] + region.extent[0],
    );
    expect(Math.min(1600, y + radius)).toBeLessThanOrEqual(
      region.origin[1] + region.extent[1],
    );
  }
  const square = miganBounds(dot, [2000, 2000]);
  const [painted] = miganMaskDabs(dot, square);
  expect(painted?.rx).toBeCloseTo((dot.size / 2) * (512 / square.extent[0]));
  expect(miganMaskDabs({ ...dot, points: [[100, 100, 0]] }, square)).toEqual(
    [],
  );
  const mask = miganMaskDabs(scratch, region);
  const first = mask[0];
  const last = mask.at(-1);
  if (!first || !last) throw Error("Scratch mask has no dabs.");
  expect(first.x).toBeGreaterThanOrEqual(0);
  expect(last.x).toBeGreaterThan(first.x);
  expect(last.x).toBeLessThanOrEqual(512);
  expect(mask.every((item) => item.y >= 0 && item.y <= 512)).toBe(true);
});

test("one preparation is shared, and cancel releases a session only when nobody is waiting", async () => {
  const released: string[] = [];
  let started = 0;
  let finish: (session: { id: string }) => void = () => {};
  const gate = createPreparationGate<{ id: string }>(async (session) => {
    released.push(session.id);
  });
  const create = () => {
    started += 1;
    return new Promise<{ id: string }>((resolve) => {
      finish = resolve;
    });
  };
  const controller = new AbortController();
  const first = gate.acquire(controller.signal, create);
  const second = gate.acquire(undefined, create);
  expect(started).toBe(1);
  controller.abort();
  finish({ id: "shared" });
  await expect(first).rejects.toThrow();
  await expect(second).resolves.toEqual({ id: "shared" });
  expect(released).toEqual([]);
  expect(gate.ready).toBe(true);

  let alone = false;
  let flight: AbortSignal | undefined;
  let finishAlone: (session: { id: string }) => void = () => {};
  const cancelled = createPreparationGate<{ id: string }>(async () => {
    alone = true;
  });
  const abort = new AbortController();
  const pending = cancelled.acquire(abort.signal, (signal) => {
    flight = signal;
    return new Promise<{ id: string }>((resolve) => {
      finishAlone = resolve;
    });
  });
  abort.abort();
  expect(flight?.aborted).toBe(true);
  finishAlone({ id: "dropped" });
  await expect(pending).rejects.toThrow();
  expect(alone).toBe(true);
  expect(cancelled.ready).toBe(false);
});

test("MI-GAN runs wait their turn and skip a turn that already aborted", async () => {
  const enqueue = createRunQueue();
  let active = 0;
  let peak = 0;
  const run = () =>
    enqueue(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
    });
  await Promise.all([run(), run()]);
  expect(peak).toBe(1);
  let ran = false;
  const abort = new AbortController();
  abort.abort();
  await expect(
    enqueue(() => {
      ran = true;
      return Promise.resolve();
    }, abort.signal),
  ).rejects.toThrow();
  expect(ran).toBe(false);
  await enqueue(() => Promise.resolve("next"));
});
