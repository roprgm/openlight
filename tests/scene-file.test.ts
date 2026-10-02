import { expect, test } from "bun:test";
import { init, target } from "vgpu/mock";
import { createControls } from "@/app/controls";
import { createImageLayer, createLayer, createMask } from "@/app/editor/layers";
import { openSceneFile } from "@/app/loaders/scene";
import { createWorkspace } from "@/app/workspace";
import { createDocument, createResources } from "@/core/document";
import { createImageSource, type WhiteBalance } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import { readZip, writeZip } from "@/lib/zip";

const asShot = { temperature: 5000, tint: 10 };
const size = [64, 32] as const;
const bytes = new Uint8Array(4096).map((_, index) => index * 7);

async function decoder(balance?: WhiteBalance) {
  const gpu = await init();
  const decoded: File[] = [];
  function decode(file: File) {
    decoded.push(file);
    const raw = balance && {
      asShot: balance,
      createPass(): never {
        throw Error("Not rendered.");
      },
      dispose() {},
    };
    return Promise.resolve(
      createImageSource(target(gpu, { size, format: "rgba16float" }), raw),
    );
  }
  return { decode, decoded };
}

test("scene files reopen the photo with every layer for further editing", async () => {
  const workspace = createWorkspace();
  const api = createControls(await init(), workspace);
  const raw = await decoder(asShot);
  try {
    await workspace.open("photo.nef", async () => {
      const file = new File([bytes], "photo.nef", {
        type: "image/x-nikon-nef",
      });
      const resources = createResources();
      const source = resources.add(file, await raw.decode(file));
      return createDocument(
        {
          frame: imageFrame(size),
          layers: [createImageLayer(source, "photo.nef", asShot)],
        },
        resources,
      );
    });
    api.setAdjustments({ exposure: 1, contrast: 20 });
    api.setWhiteBalance({ temperature: 6500 });
    api.setToneCurve([
      { x: 0, y: 0 },
      { x: 0.5, y: 0.6 },
      { x: 1, y: 1 },
    ]);
    api.setFrame({
      center: [30, 16],
      size: [40, 24],
      rotation: 90,
      angle: 5,
      scale: [-1, 1],
    });
    const mask = api.addLayer("mask");
    api.setLayerMask(mask, {
      kind: "brush",
      strokes: [
        {
          mode: "paint",
          size: 6,
          feather: 0.5,
          flow: 0.8,
          points: [
            [10.25, 8, 1],
            [20, 12.5, 0.5],
          ],
        },
      ],
    });
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
    api.addPaintStroke(paint, {
      mode: "paint",
      size: 5,
      feather: 0.3,
      flow: 1,
      color: "#ff8800",
      points: [
        [12, 6, 1],
        [30, 9, 0.7],
      ],
    });
    api.setPaintBlend(paint, "overlay");
    api.setFill({ color: "#123456", blend: "soft-light" });
    const fill = api.getState().scene?.layers.at(-1)?.id ?? "";
    api.setLayer(fill, { name: "Warm", opacity: 0.5, visible: false });
    api.setVignette({ intensity: 70, softness: 20 });
    api.setColorMixer("blue", { hue: 20, luminance: -10 });
    api.setExposure(api.addLayer("exposure"), -0.5);
    await api.openFile(
      new File(
        [
          [
            "TITLE Grade",
            "LUT_3D_SIZE 2",
            ...Array(8).fill("0.5 0.5 0.5"),
          ].join("\n"),
        ],
        "grade.cube",
      ),
    );
    const edited = workspace.getDocument().scene.getState();
    const lut = edited.layers.at(-1);
    if (lut?.kind !== "lut") throw Error("Missing LUT layer.");
    expect(lut.name).toBe("Grade");

    const file = await api.exportScene();
    expect(file.name).toBe("photo.openlight");
    const entries = await readZip(file);
    const json = JSON.parse((await entries.get("scene.json")?.text()) ?? "");
    const { source } = edited.layers[0];
    expect(json).toMatchObject({
      format: "openlight",
      version: 1,
      sources: { [source]: { name: "photo.nef", type: "image/x-nikon-nef" } },
      scene: edited,
    });
    const stored = await entries.get(`sources/${source}`)?.bytes();
    expect(stored).toEqual(bytes);

    const opened = await openSceneFile(file, raw.decode);
    const reopened = raw.decoded.at(-1);
    expect(reopened?.name).toBe("photo.nef");
    expect(reopened?.type).toBe("image/x-nikon-nef");
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
    const invalid: [Blob, string][] = [
      [new Blob(["not a zip"]), "Not a ZIP archive."],
      [
        await archive({ ...json, format: "other" }),
        "doesn't contain an OpenLight scene",
      ],
      [await archive({ ...json, version: 2 }), "needs a newer version"],
      [await archive(json, new Map()), "The scene's image is missing."],
      [
        await archive({
          ...json,
          scene: {
            ...json.scene,
            layers: [...json.scene.layers, json.scene.layers[1]],
          },
        }),
        "IDs must be unique",
      ],
      [
        await archive({
          ...json,
          scene: {
            ...json.scene,
            layers: [
              ...json.scene.layers,
              { ...json.scene.layers[2], id: "new", kind: "text" },
            ],
          },
        }),
        "Unknown layer kind: text.",
      ],
      [
        await archive({
          ...json,
          scene: {
            ...json.scene,
            layers: [
              ...json.scene.layers,
              { ...lut, id: "short", lut: { ...lut.lut, table: [0, 0, 0] } },
            ],
          },
        }),
        "The table needs three values per entry",
      ],
    ];
    for (const [kind, count, message] of [
      ["paint", 5, "up to 4 paint layers"],
      ["mask", 11, "up to 10 brush masks"],
    ] as const) {
      const layers = Array.from({ length: count }, () =>
        kind === "paint"
          ? createLayer("paint")
          : createMask({ kind: "brush", strokes: [] }),
      );
      invalid.push([
        await archive({
          ...json,
          scene: { ...json.scene, layers: [json.scene.layers[0], ...layers] },
        }),
        message,
      ]);
    }
    const decodedBefore = raw.decoded.length;
    for (const [value, message] of invalid) {
      await expect(openSceneFile(value, raw.decode)).rejects.toThrow(message);
    }

    expect(raw.decoded).toHaveLength(decodedBefore);

    // A parameter missing from a group takes its default, as in a file older than that parameter.
    const vignette = json.scene.layers.find(
      (layer: { kind: string }) => layer.kind === "vignette",
    );
    delete vignette.vignette.softness;
    delete json.scene.layers[0].whiteBalance;
    const healing = json.scene.layers.find(
      (layer: { kind: string }) => layer.kind === "heal",
    );
    delete healing.patches[0].mode;
    // Earlier files held one painted stroke per patch.
    for (const patch of healing.patches) {
      patch.stroke = patch.strokes[0];
      delete patch.strokes;
    }
    const older = await openSceneFile(await archive(json), raw.decode);
    const loaded = older.scene.getState();
    expect(loaded.layers[0].whiteBalance).toEqual(asShot);
    expect(loaded.layers.find((layer) => layer.kind === "heal")).toMatchObject({
      patches: [
        { mode: "heal", strokes: [{ mode: "paint" }] },
        { mode: "clone", strokes: [{ mode: "paint" }] },
        { mode: "remove", strokes: [{ mode: "paint" }] },
      ],
    });
    expect(
      loaded.layers.find((layer) => layer.kind === "vignette"),
    ).toMatchObject({ vignette: { intensity: 70, softness: 50 } });
    older.dispose();
  } finally {
    workspace.dispose();
  }
});
