import { useStore } from "zustand";
import { useDocument, useScene } from "@/components/editor/session";
import Button from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { EffectLayer } from "@/core/document";
import {
	addLayer,
	deleteLayer,
	duplicateLayer,
	moveLayer,
	setExposure,
	setLayer,
	setLayerMask,
} from "./edits";
import { useGradientTool } from "./gradient-tool";

export function LayersControls() {
	const document = useDocument();
	const scene = useScene((scene) => scene);
	const selected = useStore(document.selection, (state) => state.layerId);
	const tool = useGradientTool();
	function select(id: string) {
		tool.close();
		document.selectLayer(id);
	}
	return (
		<section
			aria-label="Layers"
			className="border-b border-black bg-neutral-900 p-3"
		>
			<div className="mb-2 flex items-center justify-between">
				<h2 className="text-xs font-medium text-neutral-200">Layers</h2>
			</div>
			<div className="mb-2 flex gap-1">
				<Button
					variant="ghost"
					className="px-2"
					onClick={() => addLayer(document, "exposure")}
				>
					+ Exposure
				</Button>
				<Button
					variant="ghost"
					className="px-2"
					onClick={() => addLayer(document, "vignette")}
				>
					+ Vignette
				</Button>
			</div>
			<div className="max-h-48 space-y-1 overflow-y-auto">
				{scene.layers.toReversed().map((layer) => (
					<div
						key={layer.id}
						data-selected={selected === layer.id}
						className="flex items-center gap-1 rounded bg-neutral-800/40 data-[selected=true]:bg-neutral-700"
					>
						<label className="flex min-h-8 min-w-8 cursor-pointer items-center justify-center pointer-coarse:min-h-11 pointer-coarse:min-w-11">
							<input
								type="checkbox"
								aria-label={`Show ${layer.name}`}
								checked={layer.visible}
								onChange={(event) =>
									setLayer(document, layer.id, {
										visible: event.target.checked,
									})
								}
								className="accent-neutral-300"
							/>
						</label>
						<button
							type="button"
							aria-pressed={selected === layer.id}
							className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-xs text-neutral-200"
							onClick={() => select(layer.id)}
						>
							<span className="truncate">{layer.name}</span>
							{layer.mask && (
								<span className="ml-auto text-[10px] text-neutral-400">
									Gradient
								</span>
							)}
						</button>
					</div>
				))}
				<button
					type="button"
					aria-pressed={selected === scene.image.id}
					onClick={() => select(scene.image.id)}
					data-selected={selected === scene.image.id}
					className="flex w-full items-center justify-between rounded bg-neutral-800/40 px-3 py-2 text-left text-xs text-neutral-200 data-[selected=true]:bg-neutral-700"
				>
					<span>Original</span>
					<span className="text-[10px] text-neutral-400">Image · Develop</span>
				</button>
			</div>
		</section>
	);
}

export function EffectControls({ layer }: { layer: EffectLayer }) {
	const document = useDocument();
	const layers = useScene((scene) => scene.layers);
	const tool = useGradientTool();
	const index = layers.findIndex((item) => item.id === layer.id);
	return (
		<section className="space-y-3 p-3">
			<label className="flex items-center gap-2 text-xs text-neutral-400">
				Name
				<input
					aria-label="Layer name"
					key={layer.id + layer.name}
					defaultValue={layer.name}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.currentTarget.blur();
						}
						if (event.key === "Escape") {
							event.currentTarget.value = layer.name;
							event.currentTarget.blur();
						}
					}}
					onBlur={(event) => {
						const name = event.currentTarget.value.trim();
						event.currentTarget.value = name || layer.name;
						if (name && name !== layer.name) {
							setLayer(document, layer.id, { name });
						}
					}}
					className="min-w-0 flex-1 rounded bg-neutral-800 px-2 py-1 text-neutral-100"
				/>
			</label>
			<Slider
				label="Opacity"
				value={layer.opacity * 100}
				min={0}
				max={100}
				defaultValue={100}
				onChange={(value) =>
					setLayer(document, layer.id, { opacity: value / 100 })
				}
			/>
			<div className="flex flex-wrap gap-1">
				{index < layers.length - 1 && (
					<Button
						variant="ghost"
						className="px-2"
						onClick={() => moveLayer(document, layer.id, index + 1)}
					>
						Move up
					</Button>
				)}
				{index > 0 && (
					<Button
						variant="ghost"
						className="px-2"
						onClick={() => moveLayer(document, layer.id, index - 1)}
					>
						Move down
					</Button>
				)}
				<Button
					variant="ghost"
					className="px-2"
					onClick={() => duplicateLayer(document, layer.id)}
				>
					Duplicate
				</Button>
				<Button
					variant="ghost"
					className="px-2"
					onClick={() => deleteLayer(document, layer.id)}
				>
					Delete
				</Button>
			</div>
			{layer.kind === "exposure" && (
				<Slider
					label="Exposure"
					value={layer.exposure}
					min={-5}
					max={5}
					step={0.01}
					defaultValue={0}
					onChange={(value) => setExposure(document, layer.id, value)}
				/>
			)}
			<Button
				variant="ghost"
				className="w-full"
				onClick={() => tool.draw(layer.id)}
			>
				Draw gradient mask
			</Button>
			{layer.mask && (
				<Button
					variant="ghost"
					className="w-full"
					onClick={() => setLayerMask(document, layer.id)}
				>
					Remove mask
				</Button>
			)}
		</section>
	);
}
