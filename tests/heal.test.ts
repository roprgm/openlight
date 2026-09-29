import { expect, test } from "bun:test";
import { init, target } from "vgpu/mock";
import { createImageLayer, createLayer } from "@/app/editor/layers";
import { createEditorRenderer } from "@/app/editor/renderer";
import { type BrushStroke, createDocument, findLayer } from "@/core/document";
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

async function healFixture(size: [number, number]) {
  const gpu = await init();
  const source = createImageSource(
    target(gpu, { size, format: "rgba16float" }),
  );
  const layers = [createImageLayer("photo", "Photo")] as const;
  const document = createDocument({ frame: imageFrame(size), layers });
  const renderer = createEditorRenderer(gpu, source);
  const layer = addLayer(document, createLayer("heal"));
  return {
    document,
    renderer,
    layer,
    render: (inputId?: string, interactive?: boolean) =>
      renderer.update(document.scene.getState(), inputId, interactive),
    patches() {
      const healing = findLayer(document.scene.getState().layers, layer);
      if (healing?.kind !== "heal") throw Error("Healing layer missing.");
      return healing.patches;
    },
    dispose() {
      renderer.dispose();
      document.dispose();
      source.dispose();
      gpu.dispose();
    },
  };
}

function dab(size: number, x: number, y: number): BrushStroke {
  return { mode: "paint", size, feather: 0.4, flow: 1, points: [[x, y, 1]] };
}

test("heal patches reuse brush rasters, scale with the proxy, undo, and release with the layer", async () => {
  const { document, renderer, layer, render, patches, dispose } =
    await healFixture([256, 192]);
  const inspect = () => renderer.inspect();
  document.history.begin();
  const patch = addHealPatch(document, layer, dab(30, 100, 80), [60, 0]);
  expect(patches()[0]).toMatchObject({ feather: 0.4, stroke: { feather: 0 } });
  renderer.setDisplayScale(0.25);
  await render(layer, true);
  expect(renderer.fullImage().size).toEqual([64, 48]);
  expect(inspect().rasters).toEqual([
    { id: `layer/${layer}/${patch}`, size: [256, 192], format: "r8unorm" },
  ]);
  const stamped = inspect().stamped;
  extendHealPatch(document, layer, [[120, 80, 1]]);
  await render(layer, true);
  const extended = inspect().stamped;
  expect(extended).toBeGreaterThan(stamped);
  document.history.commit();
  await render();
  expect(renderer.fullImage().size).toEqual([256, 192]);
  expect(inspect().passes.at(-1)).toBe(`layer/${layer}/${patch}/blend`);
  const { textures, effects } = inspect();
  // Committing and moving the source reuse the graph and the raster.
  setHealSource(document, layer, patch, [70, 0]);
  await render();
  expect(inspect()).toMatchObject({ textures, effects, stamped: extended });
  const erase: BrushStroke = { ...dab(4, 1, 1), mode: "erase" };
  expect(() => addHealPatch(document, layer, erase, [1, 2])).toThrow("painted");
  expect(() => setHealSource(document, layer, patch, [NaN, 0])).toThrow(
    "Invalid heal source",
  );
  // A patch that copies from itself has nothing to repair.
  setHealSource(document, layer, patch, [0, 0]);
  await render();
  expect(inspect()).toMatchObject({ effects: 0, rasters: [] });
  document.history.undo();
  await render();
  expect(inspect().rasters).toHaveLength(1);
  deleteLayer(document, layer);
  await render();
  expect(inspect().rasters).toEqual([]);
  dispose();
});

test("a heal patch's raster covers only the tiles its stroke reaches, growing with it", async () => {
  const { document, renderer, layer, render, dispose } = await healFixture([
    2048, 1536,
  ]);
  const raster = () => renderer.inspect().rasters.map(({ size }) => size);
  document.history.begin();
  addHealPatch(document, layer, dab(30, 1000, 700), [80, 0]);
  await render(undefined, true);
  // One 256 px tile rather than the whole photo.
  expect(raster()).toEqual([[256, 256]]);
  extendHealPatch(document, layer, [[1100, 700, 1]]);
  await render(undefined, true);
  expect(raster()).toEqual([[512, 256]]);
  document.history.commit();
  dispose();
});

test("one Healing layer composes its patches in order through render nodes", async () => {
  const { document, renderer, layer, render, patches, dispose } =
    await healFixture([128, 96]);
  const first = addHealPatch(document, layer, dab(24, 64, 48), [30, 0]);
  const second = addHealPatch(document, layer, dab(24, 64, 48), [-30, 0]);
  await render(first);
  const firstInput = renderer.inputImage(first);
  expect(firstInput).toBeDefined();
  // A later patch sees the result of the earlier ones.
  await render(second);
  expect(renderer.inputImage(second)).toBeDefined();
  expect(renderer.inputImage(second)).not.toBe(firstInput);
  const { passes, textures } = renderer.inspect();
  expect(passes.filter((pass) => pass.endsWith("/blend"))).toEqual([
    `layer/${layer}/${first}/blend`,
    `layer/${layer}/${second}/blend`,
  ]);
  // Moving a patch or changing its edge and opacity keeps the graph.
  setHealDestination(document, layer, first, [80, 60]);
  setHealPatch(document, layer, first, { feather: 0.2, opacity: 0.6 });
  await render(second);
  expect(renderer.inspect()).toMatchObject({ passes, textures });
  const copy = duplicateHealPatch(document, layer, first);
  const moved = { stroke: { points: [[80, 60, 1]] }, offset: [14, -12] };
  expect(patches()).toMatchObject([
    { ...moved, id: first, feather: 0.2, opacity: 0.6 },
    { ...moved, id: copy },
    { id: second },
  ]);
  deleteHealPatch(document, layer, copy);
  expect(patches().map((patch) => patch.id)).toEqual([first, second]);
  dispose();
});

test("a gesture during a finishing stroke joins its undo step", async () => {
  const { document, layer, patches, dispose } = await healFixture([64, 64]);
  expect(document.history.begin()).toBe(true);
  const patch = addHealPatch(document, layer, dab(8, 10, 10), [0, 0]);
  // A slider or handle finds the group open and leaves it to the stroke.
  expect(document.history.begin()).toBe(false);
  setHealPatch(document, layer, patch, { feather: 0.5 });
  setHealSource(document, layer, patch, [6, -2]);
  document.history.commit();
  expect(patches()[0]).toMatchObject({ feather: 0.5, offset: [6, -2] });
  document.history.undo();
  expect(patches()).toHaveLength(0);
  dispose();
});
