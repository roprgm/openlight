import { frame, type Gpu, surface } from "vgpu";
import type { EditorDocument } from "@/lib/editor/document";
import { createRenderer } from "@/lib/editor/renderer";
import { createDisplay } from "@/lib/image-display";

export type ExportOptions =
	| { format: "png" }
	| { format: "jpeg"; quality: number };

/** Renders a snapshot of the current edits at the document dimensions. */
export async function exportImage(
	gpu: Gpu,
	document: EditorDocument,
	options: ExportOptions = { format: "png" },
) {
	if (options.format !== "png" && options.format !== "jpeg") {
		throw new Error("Choose PNG or JPEG.");
	}
	if (
		options.format === "jpeg" &&
		(!Number.isFinite(options.quality) ||
			options.quality < 1 ||
			options.quality > 100)
	) {
		throw new Error("JPEG quality must be between 1 and 100.");
	}
	const scene = document.scene.getState();
	const source = document.resources.get(scene.source);
	let output: ReturnType<typeof surface> | undefined;
	let renderer: ReturnType<typeof createRenderer> | undefined;
	try {
		const [width, height] = scene.frame.size.map(Math.round);
		const canvas = new OffscreenCanvas(width, height);
		output = surface(gpu, canvas, { size: [width, height], dpr: 1 });
		renderer = createRenderer(gpu, source);
		renderer.update(scene);
		const draw = createDisplay(gpu);
		const texture = renderer.outputImage();
		const destination = output;
		frame(gpu, (frame) =>
			draw(frame, destination, texture, { view: { zoom: 1, pan: [0, 0] } }),
		);
		// Source work is submitted before yielding; the canvas owns the export pixels.
		const blob = await canvas.convertToBlob({
			type: `image/${options.format}`,
			quality: options.format === "jpeg" ? options.quality / 100 : undefined,
		});
		const extension = options.format === "jpeg" ? "jpg" : "png";
		return new File([blob], `export.${extension}`, { type: blob.type });
	} finally {
		renderer?.dispose();
		output?.dispose();
	}
}
