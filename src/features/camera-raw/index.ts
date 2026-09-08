import type { Gpu } from "vgpu";

export const rawAccept =
	".dng,.arw,.nef,.nrw,.cr2,.cr3,.crw,.orf,.rw2,.pef,.srw,.mrw,.raf,.rwl";

export function createRawDecoder(gpu: Gpu) {
	let loader: Promise<ReturnType<typeof import("./load").createLoader>>;
	return {
		accepts(file: File) {
			const extension = `.${file.name.split(".").pop()?.toLowerCase()}`;
			return (
				rawAccept.split(",").includes(extension) ||
				/^image\/x-(adobe-dng|sony-arw|nikon-nef|canon-cr2)$/.test(file.type)
			);
		},
		async load(file: Blob) {
			loader ??= import("./load").then((module) => module.createLoader(gpu));
			return (await loader)(file);
		},
	};
}
