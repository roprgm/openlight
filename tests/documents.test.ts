import { expect, test } from "bun:test";
import { init, target } from "vgpu/mock";
import { createImageLayer, createLayer } from "@/app/editor/layers";
import { createWorkspace } from "@/app/workspace";
import { createDocument, createResources } from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import { setAdjustments } from "@/features/adjustments/edits";
import { setDetails } from "@/features/details/edits";
import { addLayer } from "@/features/layers/edits";
import { defaultCurve } from "@/features/tone-curves/curve";
import { setToneCurve } from "@/features/tone-curves/edits";

function document() {
  return createDocument({
    frame: imageFrame([32, 32]),
    layers: [{ ...createImageLayer("image-1", "Photo"), id: "base" }],
  });
}

test("drop removes the latest entry only after its snapshot, leaving no redo, and cancels an open group", () => {
  const doc = document();
  const status = () => doc.history.status.getState();
  const start = doc.scene.getState();
  setAdjustments(doc, { exposure: 1 });
  const adjusted = doc.scene.getState();
  setAdjustments(doc, { exposure: 2 });
  doc.history.undo();
  doc.history.drop(adjusted);
  expect(doc.scene.getState()).toBe(adjusted);
  expect(status()).toMatchObject({ undoCount: 1, redoCount: 1 });
  doc.history.drop(start);
  expect(doc.scene.getState()).toBe(start);
  expect(status()).toMatchObject({ undoCount: 0, redoCount: 0 });
  doc.history.begin();
  setAdjustments(doc, { exposure: 3 });
  doc.history.drop(start);
  expect(doc.scene.getState()).toBe(start);
  expect(status().editing).toBe(false);
});

test("detail edits reject out-of-range values and leave the scene unchanged", () => {
  const doc = document();
  const id = addLayer(doc, createLayer("details"));
  const added = doc.scene.getState();
  for (const change of [{ sharpening: 151 }, { sharpenRadius: NaN }]) {
    expect(() => setDetails(doc, change, id)).toThrow(
      "Invalid detail adjustment",
    );
  }
  expect(doc.scene.getState()).toBe(added);
});

test("documents edit independently without React, retain bounded history, and reject edits after replacement", async () => {
  const first = document();
  const second = document();
  setAdjustments(first, { exposure: 1 });
  const points = [
    { x: 0, y: 0 },
    { x: 0.5, y: 0.7 },
    { x: 1, y: 1 },
  ];
  setToneCurve(first, points);
  points[1].y = 0.2;
  expect(first.scene.getState().layers[0].toneCurve[1].y).toBe(0.7);
  expect(second.scene.getState().layers[0].adjustments.exposure).toBe(0);
  expect(second.history.status.getState().undoCount).toBe(0);
  const unchanged = first.scene.getState();
  // Too few points, points closer than the minimum gap, and an endpoint off its edge.
  for (const curve of [
    [{ x: 0, y: 0 }],
    [
      { x: 0, y: 0 },
      { x: 1 / 2048, y: 1 },
    ],
    [
      { x: 0.1, y: 0.1 },
      { x: 1, y: 1 },
    ],
  ]) {
    expect(() => setToneCurve(first, curve)).toThrow("Invalid tone curve");
  }
  expect(first.scene.getState()).toBe(unchanged);
  first.history.undo();
  expect(first.scene.getState().layers[0].toneCurve).toEqual(defaultCurve);
  const status = () => first.history.status.getState();
  for (let i = 0; i < 150; i++) setAdjustments(first, { exposure: i % 2 });
  expect(status().undoCount).toBe(100);
  for (let i = 0; i < 100; i++) first.history.undo();
  expect(status().redoCount).toBe(100);
  setAdjustments(first, { contrast: 10 });
  expect(status()).toMatchObject({ undoCount: 1, redoCount: 0 });
  const workspace = createWorkspace();
  await workspace.open("first", async () => first);
  const stale = document();
  const pending = Promise.withResolvers<typeof stale>();
  const loading = workspace.open("slow", () => pending.promise);
  await workspace.open("second", async () => second);
  pending.resolve(stale);
  await loading;
  expect(workspace.getDocument()).toBe(second);
  for (const closed of [stale, first]) {
    expect(() => setAdjustments(closed, { exposure: 2 })).toThrow("closed");
  }
  workspace.dispose();
  expect(() => setAdjustments(second, { exposure: 2 })).toThrow("closed");

  // Resources survive undo and are released after cancellation, branching, and eviction.
  const gpu = await init();
  const resources = createResources();
  const file = new File(["fixture"], "image.png");
  const add = () =>
    resources.add(file, createImageSource(target(gpu, { size: [2, 2] })));
  const source = add();
  const base = document().scene.getState();
  const layers = [{ ...base.layers[0], source }] as const;
  const doc = createDocument({ ...base, layers }, resources);
  const replace = (source: string) => {
    const scene = doc.scene.getState();
    doc.edit({ ...scene, layers: [{ ...scene.layers[0], source }] });
  };
  const canceled = add();
  doc.history.begin();
  replace(canceled);
  doc.history.cancel();
  expect(() => resources.get(canceled)).toThrow("unavailable");
  const branch = add();
  replace(branch);
  doc.history.undo();
  expect(resources.get(branch)).toBeDefined();
  setAdjustments(doc, { exposure: 1 });
  expect(() => resources.get(branch)).toThrow("unavailable");
  const replacement = add();
  replace(replacement);
  for (let i = 0; i < 100; i++) setAdjustments(doc, { exposure: i % 2 });
  expect(() => resources.get(source)).toThrow("unavailable");
  expect(resources.get(replacement)).toBeDefined();
  doc.dispose();
  expect(() => resources.get(replacement)).toThrow("unavailable");
  gpu.dispose();
});
