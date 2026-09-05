import { useState } from "react";
import { useGpu } from "vgpu-react";
import { setLayer } from "@/app/document/edits";
import {
	useDocument,
	useScene,
	useSelectedLayer,
} from "@/app/document/provider";
import { addImageLayer } from "@/app/loaders/image";
import type { ImageLayer } from "@/app/scene";
import { ScrubInput } from "@/components/ui/scrub-input";
import { useEditGesture } from "@/hooks/use-edit-gesture";
import { accept } from "@/lib/decode";
import { LayerList } from "./layer-list";

function LayerProperties({ layer }: { layer: ImageLayer }) {
	const document = useDocument();
	const gesture = useEditGesture(document.history);
	return (
		<div {...gesture} className="flex items-center text-xs text-neutral-500">
			<span className="mr-1">Opacity</span>
			<ScrubInput
				aria-label="Opacity"
				variant="text"
				min={0}
				max={100}
				value={layer.opacity * 100}
				onChange={(opacity) =>
					setLayer(document, layer.id, { opacity: opacity / 100 })
				}
			/>
			<span className="ml-0.5">%</span>
		</div>
	);
}

export function Layers() {
	const gpu = useGpu();
	const document = useDocument();
	const layers = useScene((scene) => scene.layers);
	const selected = useSelectedLayer();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	async function add(files: File[]) {
		if (busy) {
			return;
		}
		setBusy(true);
		setError("");
		try {
			for (const file of files) {
				await addImageLayer(gpu, document, file);
			}
		} catch (error) {
			setError(
				error instanceof Error ? error.message : "Couldn't add image layer.",
			);
		} finally {
			setBusy(false);
		}
	}
	return (
		<section
			aria-label="Layers"
			className="flex max-h-[42%] min-h-24 shrink-0 flex-col bg-neutral-900 px-2 pb-2"
			onDragOver={(event) => {
				event.preventDefault();
				event.stopPropagation();
			}}
			onDrop={(event) => {
				event.preventDefault();
				event.stopPropagation();
				if (event.dataTransfer.files.length) {
					void add(Array.from(event.dataTransfer.files));
				}
			}}
		>
			<fieldset disabled={busy} className="flex min-h-0 min-w-0 flex-col">
				<div className="flex h-10 shrink-0 items-center gap-2 px-1 text-neutral-400 text-xs">
					<h2 className="flex-1 font-medium text-neutral-300">
						Layers{" "}
						<span className="ml-1 font-normal text-neutral-600">
							{layers.length}
						</span>
					</h2>
					{selected && <LayerProperties key={selected.id} layer={selected} />}
					<label
						title="Add image layer"
						className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded hover:bg-neutral-800 hover:text-neutral-100 focus-within:ring-1"
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 20 20"
							className="size-4"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
						>
							<path d="M10 4v12M4 10h12" />
						</svg>
						<input
							aria-label="Add image layer"
							type="file"
							accept={accept}
							multiple
							className="sr-only"
							onChange={(event) => {
								void add(Array.from(event.target.files ?? []));
								event.target.value = "";
							}}
						/>
					</label>
				</div>
				<LayerList />
				{!layers.length && (
					<p className="py-2 text-neutral-500 text-xs">
						Add an image to this canvas.
					</p>
				)}
			</fieldset>
			{busy && (
				<p role="status" className="pt-2 text-neutral-400 text-xs">
					Adding image…
				</p>
			)}
			{error && (
				<p role="alert" className="pt-2 text-red-400 text-xs">
					{error}
				</p>
			)}
		</section>
	);
}
