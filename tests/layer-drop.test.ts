import { expect, test } from "bun:test";
import { createLayer, createMask } from "@/app/editor/layers";
import type { Scene } from "@/core/document";
import { imageFrame } from "@/core/image/frame";
import { defaultAdjustments } from "@/features/adjustments/model";
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
const curves = { ...createLayer("curves"), id: "curves" };
const scene: Scene = {
	frame: imageFrame([32, 16]),
	layers: [
		{
			kind: "image",
			id: "image",
			name: "Photo",
			source: "photo",
			adjustments: defaultAdjustments,
			children: [],
		},
		mask,
		other,
		curves,
	],
};

// Drop positions are visual, top to bottom; results are bottom-to-top sibling indices.
test.each<[string, LayerDrop, ReturnType<typeof layerDrop>]>([
	[
		"above a root sibling",
		{ id: "curves", target: "mask", position: "before" },
		{ index: 2 },
	],
	[
		"below a root sibling",
		{ id: "curves", target: "mask", position: "after" },
		{ index: 1 },
	],
	[
		"above the image",
		{ id: "vignette", target: "image", position: "before" },
		{ index: 1 },
	],
	[
		"into a mask",
		{ id: "curves", target: "mask", position: "inside" },
		{ parentId: "mask", index: 2 },
	],
	[
		"above a nested sibling",
		{ id: "curves", target: "exposure", position: "before" },
		{ parentId: "mask", index: 1 },
	],
	[
		"below a nested sibling",
		{ id: "curves", target: "exposure", position: "after" },
		{ parentId: "mask", index: 0 },
	],
	[
		"below the image",
		{ id: "vignette", target: "image", position: "after" },
		undefined,
	],
	[
		"into the image",
		{ id: "curves", target: "image", position: "inside" },
		undefined,
	],
	[
		"the image itself",
		{ id: "image", target: "curves", position: "before" },
		undefined,
	],
	[
		"a parent into its child",
		{ id: "mask", target: "exposure", position: "inside" },
		undefined,
	],
	[
		"a parent into another mask",
		{ id: "mask", target: "other", position: "inside" },
		undefined,
	],
	[
		"a parent beside a nested layer",
		{ id: "mask", target: "details", position: "before" },
		undefined,
	],
	[
		"onto itself",
		{ id: "curves", target: "curves", position: "inside" },
		undefined,
	],
	[
		"an unknown target",
		{ id: "curves", target: "missing", position: "before" },
		undefined,
	],
])("layerDrop rejects or resolves %s", (_, drop, expected) => {
	expect(layerDrop(scene, drop)).toEqual(expected);
});
