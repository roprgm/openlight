import { useEffect, useState } from "react";
import type { Gpu } from "vgpu";
import type { Texture } from "vgpu/core";
import { useGpu } from "vgpu-react";
import decode, { type Decoded } from "@/lib/decode";

function upload(gpu: Gpu, decoded: Decoded) {
	const size = [decoded.width, decoded.height] as const;
	const texture = gpu.device.createTexture({
		size,
		format: "rgba8unorm",
		usage: ["texture_binding", "copy_dst", "render_attachment"],
	});
	if (decoded instanceof ImageBitmap) {
		gpu.gpu.queue.copyExternalImageToTexture(
			{ source: decoded },
			{ texture: texture.gpu },
			size,
		);
		decoded.close();
	} else {
		gpu.gpu.queue.writeTexture(
			{ texture: texture.gpu },
			decoded.data,
			{ bytesPerRow: decoded.width * 4 },
			size,
		);
	}
	return texture;
}

/** Uploads an image file into a sampleable rgba8 texture, disposed on cleanup. */
export default function useImageTexture(image: File) {
	const gpu = useGpu();
	const [texture, setTexture] = useState<Texture>();

	useEffect(() => {
		let current: Texture | undefined;
		let cancelled = false;
		decode(image).then((decoded) => {
			if (!cancelled) {
				current = upload(gpu, decoded);
				setTexture(current);
			}
		});
		return () => {
			cancelled = true;
			current?.dispose();
			setTexture(undefined);
		};
	}, [gpu, image]);

	return texture;
}
