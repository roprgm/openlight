import { expect, test } from "bun:test";
import { createImageLayer, createLayer, createMask } from "@/app/editor/layers";
import type { Scene } from "@/core/document";
import { imageFrame } from "@/core/image/frame";
import { type LayerDrop, layerDrop } from "@/features/layers/drop";
import { defaultGradient } from "@/features/layers/gradient";

const gradient = defaultGradient([32, 16]);
const exposure = { ...createLayer("exposure"), id: "exposure" };
const vignette = { ...createLayer("vignette"), id: "vignette" };
const details = { ...createLayer("details"), id: "details" };
const mask = {
  ...createMask(gradient),
  id: "mask",
  children: [exposure, vignette],
};
const other = { ...createMask(gradient), id: "other", children: [details] };
const top = { ...createLayer("exposure"), id: "top" };
const scene: Scene = {
  frame: imageFrame([32, 16]),
  layers: [
    { ...createImageLayer("photo", "Photo"), id: "image" },
    mask,
    other,
    top,
  ],
};

type Result = ReturnType<typeof layerDrop>;

// Drop positions are visual, top to bottom; results are bottom-to-top sibling indices.
test.each<[string, LayerDrop["position"], string, Result]>([
  ["top", "before", "mask", { index: 2 }],
  ["top", "after", "mask", { index: 1 }],
  ["vignette", "before", "image", { index: 1 }],
  ["top", "inside", "mask", { parentId: "mask", index: 2 }],
  ["top", "before", "exposure", { parentId: "mask", index: 1 }],
  // Below the image, into the image, or moving the image itself.
  ["vignette", "after", "image", undefined],
  ["top", "inside", "image", undefined],
  ["image", "before", "top", undefined],
  // A parent into its own child, into another mask, or beside a nested layer.
  ["mask", "inside", "exposure", undefined],
  ["mask", "inside", "other", undefined],
  ["mask", "before", "details", undefined],
  // Deeper than two levels, or next to a missing layer.
  ["top", "inside", "exposure", undefined],
  ["top", "before", "missing", undefined],
])("drop %s %s %s", (id, position, target, expected) => {
  expect(layerDrop(scene, { id, target, position })).toEqual(expected);
});
