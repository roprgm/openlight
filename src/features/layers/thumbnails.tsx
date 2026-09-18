import { useEffect, useId, useRef, useState } from "react";
import { frame, surface } from "vgpu";
import { useGpu } from "vgpu-react";
import { useDocument, useScene } from "@/components/editor/session";
import type { LinearGradient } from "@/core/document";
import type { Point } from "@/core/image/frame";
import { createDisplay } from "@/core/renderer";

/** A small original-image snapshot, rendered once when the source changes. */
export function ImageThumbnail() {
	const gpu = useGpu();
	const document = useDocument();
	const sourceId = useScene((scene) => scene.image.source);
	const source = document.resources.get(sourceId);
	const canvas = useRef<HTMLCanvasElement>(null);
	const [error, setError] = useState<string>();
	useEffect(() => {
		const image = new OffscreenCanvas(64, 64);
		const output = surface(gpu, image, { size: [64, 64], dpr: 1 });
		const release = source.retain();
		let active = true;
		async function draw() {
			try {
				const display = createDisplay(gpu);
				frame(gpu, (frame) =>
					display(frame, output, source.image, {
						view: { zoom: 1, pan: [0, 0] },
					}),
				);
				await gpu.gpu.queue.onSubmittedWorkDone();
				if (active) {
					const context = canvas.current?.getContext("2d");
					if (!context) {
						throw Error("Cannot draw image thumbnail.");
					}
					const bitmap = image.transferToImageBitmap();
					context.drawImage(bitmap, 0, 0);
					bitmap.close();
				}
			} catch (error) {
				if (active) {
					setError(String(error));
				}
			} finally {
				output.dispose();
				release();
			}
		}
		void draw();
		return () => {
			active = false;
		};
	}, [gpu, source]);
	return (
		<canvas
			ref={canvas}
			width={64}
			height={64}
			aria-label="Original image thumbnail"
			title={error ?? "Original image"}
			className="size-8 shrink-0 rounded-sm border border-neutral-600 bg-neutral-950"
		/>
	);
}

export function MaskThumbnail({
	mask,
	size,
}: {
	mask: LinearGradient;
	size: Point;
}) {
	const id = useId();
	return (
		<svg
			aria-label="Gradient mask thumbnail"
			role="img"
			viewBox={`0 0 ${size[0]} ${size[1]}`}
			className="size-8 shrink-0 rounded-sm border border-neutral-600 bg-neutral-950"
		>
			<defs>
				<linearGradient
					id={id}
					gradientUnits="userSpaceOnUse"
					x1={mask.start[0]}
					y1={mask.start[1]}
					x2={mask.end[0]}
					y2={mask.end[1]}
				>
					<stop offset="0" stopColor="white" />
					<stop offset="1" stopColor="black" />
				</linearGradient>
			</defs>
			<rect width={size[0]} height={size[1]} fill={`url(#${id})`} />
		</svg>
	);
}
