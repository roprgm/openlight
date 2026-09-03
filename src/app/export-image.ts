import { frame, type Gpu, surface } from "vgpu";
import { createRenderer } from "@/app/editor/renderer/renderer";
import { useScene } from "@/app/scene";

export type ExportOptions =
	| { format: "png" }
	| { format: "jpeg"; quality: number };

/** Renders a snapshot of the current edits at the original image dimensions. */
export async function exportImage(
	gpu: Gpu,
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
	const scene = useScene.getState();
	const source = scene.source;
	if (!source?.image) {
		throw new Error("Load an image before exporting.");
	}
	const [width, height] = source.image.size;
	const canvas = new OffscreenCanvas(width, height);
	const output = surface(gpu, canvas, { size: [width, height], dpr: 1 });
	const renderer = createRenderer(gpu, source.image);
	try {
		renderer.attachCanvas(output, { zoom: 1, pan: [0, 0], percent: 100 });
		frame(gpu, (frame) => renderer.render(frame, scene));
		const blob = await canvas.convertToBlob({
			type: `image/${options.format}`,
			quality: options.format === "jpeg" ? options.quality / 100 : undefined,
		});
		const extension = options.format === "jpeg" ? "jpg" : "png";
		return new File([blob], `export.${extension}`, { type: blob.type });
	} finally {
		renderer.dispose();
		output.dispose();
	}
}
