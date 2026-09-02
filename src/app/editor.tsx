import { sampler } from "vgpu";
import type { Texture } from "vgpu/core";
import { Canvas, useCanvas, useFrameLoop, useGpu, useShader } from "vgpu-react";
import ResizablePanel from "@/components/ui/resizable-panel";
import Spinner from "@/components/ui/spinner";
import useImageTexture from "@/hooks/use-image-texture";
import usePanZoom, { type View } from "@/hooks/use-pan-zoom";
import shader from "./editor.wgsl";

type ImageProps = { texture: Texture; view: View };

function Image({ texture, view }: ImageProps) {
	const gpu = useGpu();
	const target = useCanvas();
	const draw = useShader(shader, {
		set: {
			sourceSampler: sampler(gpu, { magFilter: "linear", minFilter: "linear" }),
		},
	});

	useFrameLoop((frame) => {
		draw.set({
			source: texture,
			params: {
				size: target.size,
				image: texture.size,
				pan: view.pan.map((p) => p * target.dpr),
				zoom: view.zoom,
			},
		});
		frame.pass(target, draw);
	});

	return null;
}

type EditorProps = { image: File };

export default function Editor({ image }: EditorProps) {
	const texture = useImageTexture(image);
	const { ref, view, handlers } = usePanZoom(texture?.size);

	return (
		<main className="flex h-full">
			<div
				className="grid min-w-0 flex-1 cursor-grab touch-none place-items-center active:cursor-grabbing"
				ref={ref}
				{...handlers}
			>
				{texture ? (
					<Canvas className="size-full">
						<Image texture={texture} view={view} />
					</Canvas>
				) : (
					<Spinner />
				)}
			</div>
			<ResizablePanel />
		</main>
	);
}
