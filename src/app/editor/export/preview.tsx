import { useEffect, useRef, useState } from "react";
import type { Target } from "vgpu";
import { useGpu } from "vgpu-react";
import { useRenderer } from "@/components/editor/pipeline";
import linearize from "@/lib/decode/linearize";
import { type ExportOptions, encodeImage } from "./export-image";

/** Quiet time after a change before encoding; typical encodes take tens of milliseconds. */
const settleDelay = 150;

type Encoded = { key: string; bytes: number; image: Target };

/**
 * Encodes the preview output once settings settle and decodes the file back into a target.
 * Encodes run one at a time: a change during one waits for it and runs once more.
 * The last result stays available while the current settings are still pending.
 */
export function useEncodedPreview({
	format,
	quality,
	longEdge,
}: ExportOptions) {
	const gpu = useGpu();
	const renderer = useRenderer();
	const [revision, setRevision] = useState(0);
	useEffect(
		() => renderer.subscribe(() => setRevision((count) => count + 1)),
		[renderer],
	);
	const key = `${format} ${quality} ${longEdge} ${revision}`;
	const [encoded, setEncoded] = useState<Encoded>();
	const queue = useRef(Promise.resolve());
	useEffect(() => {
		let active = true;
		const timer = setTimeout(() => {
			queue.current = queue.current.then(async () => {
				if (!active) {
					return;
				}
				try {
					const blob = await encodeImage(gpu, renderer.outputImage(), {
						format,
						quality,
						longEdge,
					});
					const bitmap = await createImageBitmap(blob);
					if (!active) {
						bitmap.close();
						return;
					}
					setEncoded({ key, bytes: blob.size, image: linearize(gpu, bitmap) });
				} catch {
					if (active) {
						setEncoded(undefined);
					}
				}
			});
		}, settleDelay);
		return () => {
			active = false;
			clearTimeout(timer);
		};
	}, [gpu, renderer, key, format, quality, longEdge]);
	useEffect(() => () => encoded?.image.color.dispose(), [encoded]);
	return { encoded, pending: encoded?.key !== key };
}
