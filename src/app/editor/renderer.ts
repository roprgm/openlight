import type { Gpu } from "vgpu";
import { createColorMixer } from "@/features/color-mixer/pass";
import { createNoiseReduction } from "@/features/noise-reduction/pass";
import { createRenderer } from "@/lib/editor/renderer";
import type { ImageSource } from "@/lib/image-source";

/** The same feature composition powers the editing preview and export. */
export function createEditorRenderer(gpu: Gpu, source: ImageSource) {
	return createRenderer(gpu, source, {
		beforeAdjustments: createNoiseReduction,
		afterCurves: (gpu, resource) => createColorMixer(gpu, resource.image),
	});
}
