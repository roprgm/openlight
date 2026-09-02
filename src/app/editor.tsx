import { useEffect, useState } from "react";
import { sampler } from "vgpu";
import { Canvas, useCanvas, useFrameLoop, useGpu, useShader } from "vgpu-react";
import ResizablePanel from "@/components/ui/resizable-panel";
import Spinner from "@/components/ui/spinner";
import Histogram from "@/features/histogram/histogram";
import usePanZoom, { type View } from "@/hooks/use-pan-zoom";
import decode, { type Target } from "@/lib/decode";
import shader from "./editor.wgsl";

/** Decodes the file into the GPU, disposing it on cleanup. */
function useDecode(file: File) {
	const gpu = useGpu();
	const [image, setImage] = useState<Target>();

	useEffect(() => {
		let cancelled = false;
		const decoding = decode(gpu, file);
		decoding.then((image) => !cancelled && setImage(image));
		return () => {
			cancelled = true;
			decoding.then((image) => image.color.dispose());
			setImage(undefined);
		};
	}, [gpu, file]);

	return image;
}

type ImageProps = { image: Target; view: View };

function Image({ image, view }: ImageProps) {
	const gpu = useGpu();
	const target = useCanvas();
	const draw = useShader(shader, {
		set: {
			sourceSampler: sampler(gpu, { magFilter: "linear", minFilter: "linear" }),
		},
	});

	useFrameLoop((frame) => {
		draw.set({
			source: image.color,
			params: {
				size: target.size,
				image: image.size,
				pan: view.pan.map((p) => p * target.dpr),
				zoom: view.zoom,
			},
		});
		frame.pass(target, draw);
	});

	return null;
}

type EditorProps = { file: File };

export default function Editor({ file }: EditorProps) {
	const image = useDecode(file);
	const { ref, view, handlers } = usePanZoom(image?.size);

	return (
		<main className="flex h-full">
			<div
				className="grid min-w-0 flex-1 cursor-grab touch-none place-items-center active:cursor-grabbing"
				ref={ref}
				{...handlers}
			>
				{image ? (
					<Canvas className="size-full min-h-0">
						<Image image={image} view={view} />
					</Canvas>
				) : (
					<Spinner />
				)}
			</div>
			<ResizablePanel>{image && <Histogram image={image} />}</ResizablePanel>
		</main>
	);
}
