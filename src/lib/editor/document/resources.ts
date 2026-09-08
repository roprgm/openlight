import type { Frame, Target } from "vgpu";

export type Development = {
	defaults: Readonly<Record<string, number>>;
	create(): {
		image: Target;
		render(frame: Frame, settings: Readonly<Record<string, number>>): void;
		dispose(): void;
	};
	dispose(): void;
};

/** Owns the document's image files and GPU targets, outside scene history. */
export function createResources() {
	const images = new Map<
		string,
		{ file: File; image: Target; development?: Development }
	>();
	let disposed = false;
	return {
		add(file: File, image: Target, development?: Development) {
			if (disposed) {
				throw new Error("Document is closed.");
			}
			const id = crypto.randomUUID();
			images.set(id, { file, image, development });
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
			for (const [id, { image, development }] of images) {
				if (!ids.has(id)) {
					image.color.dispose();
					development?.dispose();
					images.delete(id);
				}
			}
		},
		dispose() {
			disposed = true;
			for (const { image, development } of images.values()) {
				image.color.dispose();
				development?.dispose();
			}
			images.clear();
		},
	};
}
