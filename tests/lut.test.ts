import { expect, test } from "bun:test";
import { init, target } from "vgpu/mock";
import {
  createImageLayer,
  createLutLayer,
  createMask,
} from "@/app/editor/layers";
import { createEditorRenderer } from "@/app/editor/renderer";
import { createDocument, createResources } from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import { addLayer } from "@/features/layers/edits";
import { defaultGradient } from "@/features/layers/gradient";
import { readCube, readCubeFile } from "@/features/lut/cube";

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
  const { name, lut } = readCube(
    [
      "﻿# Created by hand",
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
  expect(name).toBe("Red and blue swapped");
  expect(lut).toMatchObject({
    size: 2,
    domain: [
      [0, 0, 0],
      [1, 1, 2],
    ],
  });
  // Red varies fastest: the second row answers pure red, the fifth pure blue.
  expect(lut.table.slice(3, 6)).toEqual([0, 0, 1]);
  expect(lut.table.slice(12, 15)).toEqual([1, 0, 0]);
  const untitled = await readCubeFile(
    new File(
      [["LUT_3D_SIZE 2", "LUT_3D_INPUT_RANGE -0.5 1.5", ...swap].join("\n")],
      "Warm film.cube",
    ),
  );
  expect(untitled).toMatchObject({
    name: "Warm film",
    lut: {
      domain: [
        [-0.5, -0.5, -0.5],
        [1.5, 1.5, 1.5],
      ],
    },
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

test("a LUT layer renders its table inside a mask", async () => {
  const gpu = await init();
  const source = createImageSource(
    target(gpu, { size: [16, 8], format: "rgba16float" }),
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
    const mask = addLayer(document, createMask(defaultGradient([16, 8])));
    const { name, lut } = readCube(["LUT_3D_SIZE 2", ...swap].join("\n"), "");
    const layer = addLayer(document, createLutLayer(name, lut), {
      inside: mask,
    });
    await renderer.update(document.scene.getState());
    expect(renderer.inspect().passes).toEqual([
      `layer/${layer}/lut`,
      `layer/${mask}/mix`,
    ]);
  } finally {
    renderer.dispose();
    document.dispose();
    gpu.dispose();
  }
});
