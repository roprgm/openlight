import type { Target } from "vgpu";

export type WhiteBalance = { temperature: number; tint: number };
export type RawPass = {
	prepare(balance: WhiteBalance): Promise<void>;
	render(): Target;
	dispose(): void;
};
export type RawDevelopment = {
	asShot: WhiteBalance;
	createPass(): RawPass;
	/** Optional sensor-domain denoising, prepared before demosaic and white balance. */
	createDenoisedPass?(): RawPass;
	dispose(): void;
};

/** Document content retained while a preview or export still uses it. */
export function createImageSource(image: Target, raw?: RawDevelopment) {
	let references = 1;
	function release() {
		let active = true;
		return () => {
			if (!active) {
				return;
			}
			active = false;
			if (--references === 0) {
				image.color.dispose();
				raw?.dispose();
			}
		};
	}
	return {
		image,
		raw,
		retain() {
			if (!references) {
				throw Error("Image source is closed.");
			}
			references++;
			return release();
		},
		dispose: release(),
	};
}

export type ImageSource = ReturnType<typeof createImageSource>;
