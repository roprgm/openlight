import { expect, test } from "bun:test";
import { init, target } from "vgpu/mock";
import { createImageLayer } from "@/app/editor/layers";
import { createWorkspace } from "@/app/workspace";
import { createDocument, createResources } from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import { setAdjustments } from "@/features/adjustments/edits";
import { validateDetails } from "@/features/details/model";
import { defaultCurve } from "@/features/tone-curves/curve";
import { setToneCurve } from "@/features/tone-curves/edits";

function document() {
  return createDocument({
    frame: imageFrame([32, 32]),
    layers: [{ ...createImageLayer("image-1", "Photo"), id: "base" }],
  });
}

test("drop removes the latest entry without leaving redo and cancels an open group", () => {
  const doc = document();
  setAdjustments(doc, { exposure: 1 });
  setAdjustments(doc, { exposure: 2 });
  doc.history.undo();
  doc.history.drop();
  expect(doc.scene.getState().layers[0].adjustments.exposure).toBe(0);
  expect(doc.history.status.getState()).toEqual({
    undoCount: 0,
    redoCount: 0,
    editing: false,
  });
  doc.history.begin();
  setAdjustments(doc, { exposure: 3 });
  doc.history.drop();
  expect(doc.scene.getState().layers[0].adjustments.exposure).toBe(0);
  expect(doc.history.status.getState().undoCount).toBe(0);
});

test("documents edit independently without React, retain bounded history, and reject edits after replacement", async () => {
  const first = document();
  const second = document();
  for (const change of [
    { sharpening: -1 },
    { sharpening: 151 },
    { sharpenRadius: 0 },
    { sharpenRadius: 3.1 },
    { sharpenRadius: NaN },
  ]) {
    expect(() => validateDetails(change)).toThrow("Invalid detail adjustment");
  }

  setAdjustments(first, { exposure: 1 });
  const points = [
    { x: 0, y: 0 },
    { x: 0.5, y: 0.7 },
    { x: 1, y: 1 },
  ];
  setToneCurve(first, points);
  points[1].y = 0.2;
  expect(first.scene.getState().layers[0]).toMatchObject({
    toneCurve: [
      { x: 0, y: 0 },
      { x: 0.5, y: 0.7 },
      { x: 1, y: 1 },
    ],
  });
  expect(second.scene.getState().layers[0].adjustments.exposure).toBe(0);
  expect(second.history.status.getState().undoCount).toBe(0);
  const unchanged = first.scene.getState();
  for (const curve of [
    [],
    [{ x: 0, y: 0 }],
    [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
    ],
    [
      { x: 0, y: 0 },
      { x: 1 / 2048, y: 1 },
    ],
    [
      { x: 0, y: 0 },
      { x: 0.8, y: 0.5 },
      { x: 0.5, y: 1 },
    ],
    [
      { x: 0, y: 0 },
      { x: 1, y: Number.NaN },
    ],
    [
      { x: 0, y: -1 },
      { x: 1, y: 1 },
    ],
    [
      { x: 0.1, y: 0.1 },
      { x: 1, y: 1 },
    ],
    [
      { x: 0, y: 0 },
      { x: 0.9, y: 0.9 },
    ],
  ]) {
    expect(() => setToneCurve(first, curve)).toThrow();
  }
  expect(first.scene.getState()).toBe(unchanged);
  first.history.undo();
  expect(first.scene.getState().layers[0]).toMatchObject({
    toneCurve: defaultCurve,
  });
  for (let i = 0; i < 150; i++) setAdjustments(first, { exposure: i % 2 });
  expect(first.history.status.getState().undoCount).toBe(100);
  for (let i = 0; i < 100; i++) first.history.undo();
  expect(first.history.status.getState()).toEqual({
    undoCount: 0,
    redoCount: 100,
    editing: false,
  });
  setAdjustments(first, { contrast: 10 });
  expect(first.history.status.getState()).toEqual({
    undoCount: 1,
    redoCount: 0,
    editing: false,
  });
  const workspace = createWorkspace();
  await workspace.open("first", async () => first);
  const stale = document();
  let release = () => {};
  const pending = new Promise<typeof stale>((resolve) => {
    release = () => resolve(stale);
  });
  const loading = workspace.open("slow", () => pending);
  await workspace.open("second", async () => second);
  release();
  await loading;
  expect(() => setAdjustments(stale, { exposure: 2 })).toThrow("closed");
  expect(workspace.getDocument()).toBe(second);
  expect(() => setAdjustments(first, { exposure: 2 })).toThrow("closed");
  workspace.dispose();
  expect(() => setAdjustments(second, { exposure: 2 })).toThrow("closed");

  // Resources survive undo and are released after cancellation, branching, and eviction.
  const gpu = await init();
  const resources = createResources();
  const file = new File(["fixture"], "image.png");
  const add = () =>
    resources.add(file, createImageSource(target(gpu, { size: [2, 2] })));
  const source = add();
  const doc = createDocument(
    {
      ...document().scene.getState(),
      layers: [{ ...document().scene.getState().layers[0], source }],
    },
    resources,
  );
  const replace = (source: string) =>
    doc.edit({
      ...doc.scene.getState(),
      layers: [{ ...doc.scene.getState().layers[0], source }],
    });
  const canceled = add();
  doc.history.begin();
  replace(canceled);
  expect(resources.get(source)).toBeDefined();
  doc.history.cancel();
  expect(() => resources.get(canceled)).toThrow("unavailable");
  const branch = add();
  replace(branch);
  doc.history.undo();
  expect(resources.get(branch)).toBeDefined();
  doc.history.redo();
  expect(doc.scene.getState().layers[0].source).toBe(branch);
  doc.history.undo();
  setAdjustments(doc, { exposure: 1 });
  expect(() => resources.get(branch)).toThrow("unavailable");
  const replacement = add();
  replace(replacement);
  for (let i = 0; i < 100; i++) {
    setAdjustments(doc, { exposure: i % 2 });
  }
  expect(() => resources.get(source)).toThrow("unavailable");
  expect(resources.get(replacement)).toBeDefined();
  const frame = doc.scene.getState().frame;
  for (const invalid of [
    { ...frame, size: [0, 1] as const },
    { ...frame, scale: [0, 1] as const },
    { ...frame, angle: Number.NaN },
  ]) {
    expect(() => doc.edit({ ...doc.scene.getState(), frame: invalid })).toThrow(
      "Invalid image frame",
    );
  }
  expect(doc.scene.getState().frame).toBe(frame);

  doc.dispose();
  expect(() => resources.get(replacement)).toThrow("unavailable");
  gpu.dispose();
});
