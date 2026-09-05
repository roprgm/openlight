import { useEffect, useMemo, useRef } from "react";
import { effect, frame, sampler, type Target } from "vgpu";
import { useGpu, useSurface } from "vgpu-react";
import shader from "./thumbnail.wgsl";

/** Draw the already-decoded source once, including formats the browser cannot show in an img. */
export function LayerThumbnail({ image }: { image: Target }) {
	const gpu = useGpu();
	const ref = useRef<HTMLCanvasElement>(null);
	const surface = useSurface(ref, { size: [40, 30], dpr: 2 });
	const preview = useMemo(
		() =>
			effect(gpu, shader, {
				set: {
					source: image.color,
					sourceSampler: sampler(gpu, {
						minFilter: "linear",
						magFilter: "linear",
					}),
				},
			}),
		[gpu, image],
	);
	useEffect(() => {
		if (surface) {
			frame(gpu, (frame) =>
				frame.pass(surface, preview.set({ size: surface.size })),
			);
		}
	}, [gpu, surface, preview]);
	return (
		<canvas
			ref={ref}
			aria-label="Image source preview"
			className="h-[30px] w-10 shrink-0 rounded-sm ring-1 ring-white/10"
		/>
	);
}
