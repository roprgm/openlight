import type { Page } from "@playwright/test";

/** Read actual exported or downloaded pixels, independently of the renderer. */
export async function readImage(page: Page, bytes?: Uint8Array) {
	return page.evaluate(
		async (bytes) => {
			const file = bytes
				? new Blob([new Uint8Array(bytes)])
				: await window.openlight.exportImage();
			const image = await createImageBitmap(file);
			const canvas = new OffscreenCanvas(image.width, image.height);
			const context = canvas.getContext("2d");
			if (!context) throw new Error("Cannot read image pixels.");
			context.drawImage(image, 0, 0);
			image.close();
			return {
				size: [canvas.width, canvas.height],
				center: [
					...context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1)
						.data,
				],
				corner: [...context.getImageData(10, 10, 1, 1).data],
			};
		},
		bytes ? [...bytes] : null,
	);
}

/** Sample the displayed canvas, including preview-only overlays. */
export async function readPreview(page: Page) {
	const bytes = await page.locator("canvas").screenshot();
	return page.evaluate(
		async (bytes) => {
			const image = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
			const canvas = new OffscreenCanvas(image.width, image.height);
			const context = canvas.getContext("2d");
			if (!context) throw new Error("Cannot read preview pixels.");
			context.drawImage(image, 0, 0);
			image.close();
			const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
			let red = 0;
			let blue = 0;
			for (let i = 0; i < data.length; i += 4) {
				if (data[i] === 255 && data[i + 1] === 0 && data[i + 2] === 0) {
					red++;
				}
				if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 255) {
					blue++;
				}
			}
			return {
				center: [
					...context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1)
						.data,
				],
				red,
				blue,
			};
		},
		[...bytes],
	);
}
