import { expect, test } from "bun:test";
import { init, target } from "vgpu/mock";
import { addLut, createImageLayer, createMask } from "@/app/editor/layers";
import { createEditorRenderer } from "@/app/editor/renderer";
import { createDocument, createResources, findLayer } from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import { setAdjustments } from "@/features/adjustments/edits";
import { addLayer, setLayer } from "@/features/layers/edits";
import { defaultGradient } from "@/features/layers/gradient";
import { readCube, readCubeFile } from "@/features/lut/cube";
import { setLut } from "@/features/lut/edits";

/** A two-point LUT that swaps red and blue, rows listed with red varying fastest. */
const swap = [
  "0 0 0",
  "0 0 1",
  "0 1 0",
  "0 1 1",
  "1 0 0",
  "1 0 1",
  "1 1 0",
  "1 1 1",
];

test("a .cube file reads into a 3D table with its title, domain, and row order, and a broken one says why", async () => {
  const lut = readCube(
    [
      "\uFEFF# Created by hand",
      'TITLE "Red and blue swapped"',
      "",
      "LUT_3D_SIZE 2",
      "DOMAIN_MIN 0 0 0",
      "DOMAIN_MAX 1 1 2",
      "LUT_IN_VIDEO_RANGE",
      "  # the table",
      ...swap.map((row) => `${row}  `),
    ].join("\r\n"),
    "swap",
  );
  expect(lut).toMatchObject({
    name: "Red and blue swapped",
    size: 2,
    domain: [
      [0, 0, 0],
      [1, 1, 2],
    ],
  });
  // Red varies fastest: the second row answers pure red, the fifth pure blue.
  expect([...lut.table.subarray(3, 6)]).toEqual([0, 0, 1]);
  expect([...lut.table.subarray(12, 15)]).toEqual([1, 0, 0]);
  const untitled = await readCubeFile(
    new File(
      [["LUT_3D_SIZE 2", "LUT_3D_INPUT_RANGE -0.5 1.5", ...swap].join("\n")],
      "Warm film.cube",
    ),
  );
  expect(untitled).toMatchObject({
    name: "Warm film",
    domain: [
      [-0.5, -0.5, -0.5],
      [1.5, 1.5, 1.5],
    ],
  });
  const broken: [string[], string][] = [
    [swap, "Line 1: the table starts before LUT_3D_SIZE."],
    [["TITLE x"], "LUT_3D_SIZE is missing"],
    [["LUT_1D_SIZE 2", "0 0 0", "1 1 1"], "This is a 1D LUT"],
    [["LUT_3D_SIZE 1"], "Line 1: LUT_3D_SIZE must be a whole number from 2"],
    [["LUT_3D_SIZE 66"], "from 2 to 65"],
    [["LUT_3D_SIZE 2.5"], "from 2 to 65"],
    [["LUT_3D_SIZE two"], "Line 1: expected a number."],
    [["LUT_3D_SIZE 2", "LUT_3D_SIZE 2"], "Line 2: LUT_3D_SIZE appears twice."],
    [["LUT_3D_SIZE 2", ...swap.slice(1)], "needs 8 rows; found 7."],
    [["LUT_3D_SIZE 2", ...swap, "1 1 1"], "Line 10: LUT_3D_SIZE 2 needs 8"],
    [["LUT_3D_SIZE 2", "0 0", ...swap.slice(1)], "Line 2: expected 3 numbers."],
    [["LUT_3D_SIZE 2", "0 0 NaN", ...swap.slice(1)], "expected 3 numbers."],
    [["DOMAIN_MIN 0 0", "LUT_3D_SIZE 2", ...swap], "Line 1: expected 3"],
    [["DOMAIN_MAX 1 0 1", "LUT_3D_SIZE 2", ...swap], "below DOMAIN_MAX"],
  ];
  for (const [lines, message] of broken) {
    expect(() => readCube(lines.join("\n"), "broken")).toThrow(message);
  }
});

test("a LUT layer renders its table, nests in a mask, follows a replacement's name, and keeps its file only while history uses it", async () => {
  const gpu = await init();
  const source = createImageSource(
    target(gpu, { size: [16, 8], format: "rgba16float" }),
  );
  const resources = createResources();
  const sourceId = resources.add(new File([], "photo.png"), source);
  const document = createDocument(
    {
      frame: imageFrame(source.image.size),
      layers: [{ ...createImageLayer(sourceId, "Photo"), id: "base" }],
    },
    resources,
  );
  const renderer = createEditorRenderer(gpu, source, resources.getLut);
  const read = (lines: string[], name: string) =>
    readCube(["LUT_3D_SIZE 2", ...lines].join("\n"), name);
  const swapFile = new File([], "swap.cube");
  const layer = (id: string) => findLayer(document.scene.getState().layers, id);
  const lutOf = (id: string) => {
    const item = layer(id);
    if (item?.kind !== "lut") throw Error("Missing LUT layer.");
    return item.lut;
  };
  try {
    const mask = addLayer(document, createMask(defaultGradient([16, 8])));
    const nested = addLut(document, swapFile, read(swap, "Swap"), {
      inside: mask,
    });
    expect(layer(nested)).toMatchObject({ kind: "lut", name: "Swap" });
    await renderer.update(document.scene.getState());
    expect(renderer.inspect().passes).toEqual([
      `layer/${nested}/lut`,
      `layer/${mask}/mix`,
    ]);

    const identity = read(
      Array.from({ length: 8 }, (_, i) => `${i & 1} ${(i >> 1) & 1} ${i >> 2}`),
      "Identity",
    );
    const replaced = resources.addLut(new File([], "identity.cube"), identity);
    setLut(document, nested, replaced);
    expect(layer(nested)).toMatchObject({ lut: replaced, name: "Identity" });
    setLayer(document, nested, { name: "Neutral" });
    setLut(document, nested, resources.addLut(swapFile, read(swap, "Swap")));
    expect(layer(nested)).toMatchObject({ name: "Neutral" });
    expect(() => setLut(document, mask, replaced)).toThrow("Select a LUT");
    expect(() => setLut(document, nested, "missing")).toThrow("unavailable");

    // A LUT stays while undo or redo can reach it and goes once a new edit drops that branch.
    const top = lutOf(addLut(document, swapFile, read(swap, "Top")));
    document.history.undo();
    expect(resources.getLut(top).name).toBe("Top");
    setAdjustments(document, { exposure: 1 });
    expect(() => resources.getLut(top)).toThrow("unavailable");
    expect(resources.getLut(replaced).name).toBe("Identity");

    // Adding while a gesture is open commits it first, so the new table is kept.
    document.history.begin();
    setAdjustments(document, { exposure: 0.5 });
    const grouped = lutOf(addLut(document, swapFile, read(swap, "Grouped")));
    expect(resources.getLut(grouped).name).toBe("Grouped");
  } finally {
    renderer.dispose();
    document.dispose();
    gpu.dispose();
  }
});
