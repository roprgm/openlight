import type { ImageSource } from "@/lib/image-source";

/** Owns the document's image files and GPU targets, outside scene history. */
export function createResources() {
	const images = new Map<string, { file: File } & ImageSource>();
	let disposed = false;
	return {
		add(file: File, source: ImageSource) {
			if (disposed) {
				throw new Error("Document is closed.");
			}
			const id = crypto.randomUUID();
			images.set(id, { file, ...source });
			return id;
		},
		get(id: string) {
			const resource = images.get(id);
			if (!resource) {
				throw new Error("Image resource is unavailable.");
			}
			return resource;
		},
		retain(ids: ReadonlySet<string>) {
			for (const [id, source] of images) {
				if (!ids.has(id)) {
					source.dispose();
					images.delete(id);
				}
			}
		},
		dispose() {
			disposed = true;
			for (const source of images.values()) {
				source.dispose();
			}
			images.clear();
		},
	};
}
