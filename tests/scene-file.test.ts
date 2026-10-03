import { expect, test } from "bun:test";
import { init, target } from "vgpu/mock";
import { createControls } from "@/app/controls";
import { createImageLayer, createLayer, createMask } from "@/app/editor/layers";
import { openSceneFile, writeSceneFile } from "@/app/loaders/scene";
import { createWorkspace } from "@/app/workspace";
import {
  type BrushStroke,
  createDocument,
  createResources,
} from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import { readZip, writeZip } from "@/lib/zip";

const asShot = { temperature: 5000, tint: 10 };
const size = [64, 32] as const;
const bytes = new Uint8Array(4096).map((_, index) => index * 7);

test("scene files reopen the photo with every layer for further editing", async () => {
  const gpu = await init();
  const workspace = createWorkspace();
  const api = createControls(gpu, workspace);
  const decoded: File[] = [];
  const decode = (file: File) => {
    decoded.push(file);
    const raw = {
      asShot,
      createPass(): never {
        throw Error("Not rendered.");
      },
      dispose() {},
    };
    const image = target(gpu, { size, format: "rgba16float" });
    return Promise.resolve(createImageSource(image, raw));
  };
  const nef = new File([bytes], "photo.nef", { type: "image/x-nikon-nef" });
  const resources = createResources();
  const source = resources.add(nef, await decode(nef));
  const layers = [createImageLayer(source, "photo.nef", asShot)] as const;
  const frame = imageFrame(size);
  const document = createDocument({ frame, layers }, resources);
  await workspace.open("photo.nef", async () => document);
  api.setAdjustments({ exposure: 1, contrast: 20 });
  api.setWhiteBalance({ temperature: 6500 });
  api.setToneCurve([
    { x: 0, y: 0 },
    { x: 0.5, y: 0.6 },
    { x: 1, y: 1 },
  ]);
  api.setFrame({ ...imageFrame(size), angle: 5, scale: [-0.8, 0.8] });
  const mask = api.addLayer("mask");
  const stroke: BrushStroke = {
    mode: "paint",
    size: 6,
    feather: 0.5,
    flow: 0.8,
    points: [[10.25, 8, 0.5]],
  };
  api.setLayerMask(mask, { kind: "brush", strokes: [stroke] });
  api.setAdjustments({ shadows: 40 }, mask);
  const tones = api.addLayer("mask", { inside: mask });
  api.setLayerMask(tones, {
    kind: "luminance-range",
    low: 20,
    high: 80,
    smoothness: 10,
  });
  api.setMaskOperation(tones, "intersect");
  api.run({
    type: "add-mask",
    mask: { kind: "color-range", color: "#336699", tolerance: 40 },
  });
  api.run({
    type: "add-mask",
    mask: { kind: "color-range", color: null, tolerance: 30 },
  });
  api.setDetails({ clarity: 30 }, api.addLayer("details", { inside: mask }));
  const subtract = api.addLayer("mask", { inside: mask });
  api.setLayerMask(subtract, {
    kind: "radial",
    center: [16, 16],
    radius: [8, 6],
    angle: 30,
    feather: 0.4,
  });
  api.setMaskOperation(subtract, "subtract");
  const heal = api.addLayer("heal");
  const firstPatch = api.addHealPatch(
    heal,
    { mode: "paint", size: 4, feather: 0.2, flow: 1, points: [[40, 20, 1]] },
    [-6, 2],
  );
  api.addHealStroke(heal, firstPatch, {
    mode: "paint",
    size: 6,
    feather: 0.2,
    flow: 1,
    points: [[44, 22, 1]],
  });
  api.addHealStroke(heal, firstPatch, {
    mode: "erase",
    size: 2,
    feather: 0,
    flow: 1,
    points: [[40, 20, 1]],
  });
  api.addHealPatch(
    heal,
    { mode: "paint", size: 4, feather: 0.2, flow: 1, points: [[48, 20, 1]] },
    [-6, 2],
    "clone",
  );
  api.addRemovePatch(heal, {
    mode: "paint",
    size: 4,
    feather: 0.2,
    flow: 1,
    points: [[52, 24, 1]],
  });
  const paint = api.addLayer("paint");
  api.addPaintStroke(paint, { ...stroke, color: "#ff8800" });
  api.setPaintBlend(paint, "overlay");
  api.setFill({ color: "#123456", blend: "soft-light" });
  const fill = api.getState().scene?.layers.at(-1)?.id ?? "";
  api.setLayer(fill, { name: "Warm", opacity: 0.5, visible: false });
  api.setVignette({ intensity: 70, softness: 20 });
  api.setColorMixer("blue", { hue: 20, luminance: -10 });
  api.setExposure(api.addLayer("exposure"), -0.5);
  const cube = [
    "TITLE Grade",
    "LUT_3D_SIZE 2",
    ...Array(8).fill("0.5 0.5 0.5"),
  ];
  await api.openFile(new File([cube.join("\n")], "grade.cube"));
  const edited = workspace.getDocument().scene.getState();
  const lut = edited.layers.at(-1);
  if (lut?.kind !== "lut") throw Error("Missing LUT layer.");
  expect(lut.name).toBe("Grade");

  const file = await api.exportScene();
  expect(file.name).toBe("photo.openlight");
  const entries = await readZip(file);
  const json = JSON.parse((await entries.get("scene.json")?.text()) ?? "");
  // The Remove patch was never rendered, so its field waits, with nothing it extends.
  const removal = edited.layers
    .flatMap((layer) => (layer.kind === "heal" ? layer.patches : []))
    .find((patch) => patch.mode === "remove");
  if (removal?.mode !== "remove") throw Error("Missing Remove patch.");
  expect(json).toMatchObject({
    format: "openlight",
    version: 2,
    sources: { [source]: { name: "photo.nef", type: "image/x-nikon-nef" } },
    fields: { [removal.field]: {} },
    scene: edited,
  });
  const opened = await openSceneFile(file, decode);
  const reopened = decoded.at(-1);
  expect(reopened).toMatchObject({ name: "photo.nef", type: nef.type });
  expect(await reopened?.bytes()).toEqual(bytes);
  expect(opened.scene.getState()).toEqual(edited);
  expect(opened.history.status.getState().undoCount).toBe(0);
  opened.dispose();

  async function archive(value: unknown, sources = entries) {
    return writeZip([
      { name: "scene.json", data: new Blob([JSON.stringify(value)]) },
      ...[...sources]
        .filter(([name]) => name !== "scene.json")
        .map(([name, data]) => ({ name, data })),
    ]);
  }
  const saved = json.scene.layers;
  const withLayers = (layers: unknown[]) =>
    archive({ ...json, scene: { ...json.scene, layers } });
  const adding = (layer: unknown) => withLayers([...saved, layer]);
  const many = (count: number, layer: () => unknown) =>
    withLayers([saved[0], ...Array.from({ length: count }, layer)]);
  const invalid: [Blob, string][] = [
    [new Blob(["not a zip"]), "Not a ZIP archive."],
    [await archive({ ...json, format: "other" }), "an OpenLight scene"],
    [await archive({ ...json, version: 3 }), "needs a newer version"],
    [await archive({ ...json, fields: {} }), "Remove fields are missing"],
    [
      await archive({
        ...json,
        fields: {
          [removal.field]: { origin: [40, 12], scale: 1, size: [16, 16] },
        },
      }),
      "Remove fields are missing",
    ],
    [await archive(json, new Map()), "The scene's image is missing."],
    [await adding(saved[1]), "IDs must be unique"],
    [await adding({ id: "new", kind: "text" }), "Unknown layer kind: text."],
    [
      await adding({
        ...lut,
        id: "short",
        lut: { ...lut.lut, table: [0, 0, 0] },
      }),
      "The table needs three values per entry",
    ],
    [await many(5, () => createLayer("paint")), "up to 4 paint layers"],
    [
      await many(11, () => createMask({ kind: "brush", strokes: [] })),
      "up to 10 brush masks",
    ],
  ];
  const decodes = decoded.length;
  for (const [value, message] of invalid) {
    await expect(openSceneFile(value, decode)).rejects.toThrow(message);
  }
  expect(decoded).toHaveLength(decodes);

  // A parameter missing from a group takes its default, as in a file older than that parameter.
  const vignette = saved.find(
    (layer: { kind: string }) => layer.kind === "vignette",
  );
  delete vignette.vignette.softness;
  delete saved[0].whiteBalance;
  const healing = json.scene.layers.find(
    (layer: { kind: string }) => layer.kind === "heal",
  );
  delete healing.patches[0].mode;
  // Earlier files held one painted stroke per patch.
  for (const patch of healing.patches) {
    patch.stroke = patch.strokes[0];
    delete patch.strokes;
  }
  // Version 1 wrote a Remove field inside its patch, with how many strokes it covered.
  const lattice = { origin: [40, 12], scale: 1, size: [16, 16] } as const;
  healing.patches[2].field = { texels: "inline", strokes: 1, ...lattice };
  const texels = new Blob(["texels"]);
  const older = await openSceneFile(
    await archive(
      { ...json, version: 1, fields: undefined },
      new Map([...entries, ["fields/inline", texels]]),
    ),
    decode,
  );
  const loaded = older.scene.getState();
  expect(loaded.layers[0].whiteBalance).toEqual(asShot);
  expect(loaded.layers.find((layer) => layer.kind === "heal")).toMatchObject({
    patches: [
      { mode: "heal", strokes: [{ mode: "paint" }] },
      { mode: "clone", strokes: [{ mode: "paint" }] },
      { mode: "remove", strokes: [{ mode: "paint" }], field: "inline" },
    ],
  });
  expect(older.resources.field("inline")).toEqual({
    texels: expect.any(Blob),
    ...lattice,
  });

  expect(
    loaded.layers.find((layer) => layer.kind === "vignette"),
  ).toMatchObject({ vignette: { intensity: 70, softness: 50 } });
  older.dispose();
  workspace.dispose();
  gpu.dispose();
});

test("a scene file waits for the fields the editor reads back and still saves once another photo closes its document", async () => {
  const gpu = await init();
  const resources = createResources();
  const png = new File([bytes], "photo.png", { type: "image/png" });
  const source = resources.add(
    png,
    createImageSource(target(gpu, { size, format: "rgba16float" })),
  );
  const document = createDocument(
    {
      frame: imageFrame(size),
      layers: [createImageLayer(source, "photo.png")],
    },
    resources,
  );
  let captured = () => {};
  document.onCaptureFields(
    () =>
      new Promise((resolve) => {
        captured = () => resolve(new Map());
      }),
  );
  const saving = writeSceneFile(document);
  document.dispose();
  captured();
  const entries = await readZip(await saving);
  expect(await entries.get(`sources/${source}`)?.bytes()).toEqual(bytes);
  gpu.dispose();
});
