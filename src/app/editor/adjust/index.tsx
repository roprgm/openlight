import { useStore } from "zustand";
import {
	PanelContent,
	useDocument,
	useScene,
} from "@/components/editor/session";
import Button from "@/components/ui/button";
import { ScrubInput } from "@/components/ui/scrub-input";
import { Slider } from "@/components/ui/slider";
import {
	findLayer,
	type Layer,
	type MaskLayer,
	walkLayers,
} from "@/core/document";
import {
	AdjustmentControls,
	BasicAdjustments,
	TemperatureControls,
} from "@/features/adjustments/controls";
import { ColorMixerControls } from "@/features/color-mixer/controls";
import {
	setExposure,
	setLayer,
	setMaskOperation,
} from "@/features/layers/edits";
import { useGradientTool } from "@/features/layers/gradient-tool";
import { setToneCurve } from "@/features/tone-curves/edits";
import { ToneCurves } from "@/features/tone-curves/tone-curves";
import { VignetteControls } from "@/features/vignette/controls";
import { WhiteBalanceControls } from "@/features/white-balance/controls";
import { useEditGesture } from "@/hooks/use-edit-gesture";

function ColorTemperatureControls() {
	const document = useDocument();
	const source = useScene((scene) => scene.layers[0].source);
	if (document.resources.get(source).raw) {
		return <WhiteBalanceControls />;
	}
	return <TemperatureControls />;
}

function MaskControls({ layer }: { layer: MaskLayer }) {
	const document = useDocument();
	const tool = useGradientTool();
	const parent = useScene((scene) =>
		walkLayers(scene.layers).find((item) =>
			item.children.some((child) => child.id === layer.id),
		),
	);
	const isSubmask = parent?.kind === "mask";
	return (
		<section className="space-y-3 p-3">
			<div className="flex items-center justify-between text-xs text-neutral-500">
				<span>Linear gradient</span>
				<Button
					variant="ghost"
					className="px-2 py-1"
					onClick={() => tool.draw(layer.id)}
				>
					Redraw
				</Button>
			</div>
			{isSubmask && (
				<label className="flex items-center justify-between text-xs text-neutral-400">
					Combine mask
					<select
						aria-label="Mask operation"
						value={layer.operation}
						className="rounded bg-neutral-800 px-2 py-1"
						onChange={(event) => {
							const operation = event.target.value;
							if (operation === "add" || operation === "subtract") {
								setMaskOperation(document, layer.id, operation);
							}
						}}
					>
						<option value="add">Add</option>
						<option value="subtract">Subtract</option>
					</select>
				</label>
			)}
			{!isSubmask && (
				<BasicAdjustments id={layer.id} adjustments={layer.adjustments} />
			)}
			{!parent && (
				<div className="flex items-center gap-1 border-t border-neutral-800 pt-3 text-xs text-neutral-500">
					<span className="mr-auto">Mask</span>
					<Button
						variant="ghost"
						className="px-2 py-1"
						aria-label="Add to mask"
						onClick={() => tool.add(layer.id, "add")}
					>
						Add
					</Button>
					<Button
						variant="ghost"
						className="px-2 py-1"
						aria-label="Subtract from mask"
						onClick={() => tool.add(layer.id, "subtract")}
					>
						Subtract
					</Button>
				</div>
			)}
		</section>
	);
}

function SelectedControls({ layer }: { layer: Layer }) {
	const document = useDocument();
	switch (layer.kind) {
		case "image":
			return <AdjustmentControls temperature={<ColorTemperatureControls />} />;
		case "color-mixer":
			return <ColorMixerControls id={layer.id} mixer={layer.colorMixer} />;
		case "curves":
			return (
				<div className="p-3">
					<ToneCurves
						points={layer.toneCurve}
						onChange={(points) => setToneCurve(document, points, layer.id)}
					/>
				</div>
			);
		case "vignette":
			return <VignetteControls id={layer.id} vignette={layer.vignette} />;
		case "exposure":
			return (
				<section className="p-3">
					<Slider
						label="Exposure"
						value={layer.exposure}
						min={-5}
						max={5}
						step={0.01}
						defaultValue={0}
						onChange={(value) => setExposure(document, layer.id, value)}
					/>
				</section>
			);
		case "mask":
			return <MaskControls layer={layer} />;
	}
}

export function AdjustPanel() {
	const document = useDocument();
	const gesture = useEditGesture(document.history);
	const selected = useStore(document.selection, (state) => state.layerId);
	const layer = useScene(
		(scene) => findLayer(scene.layers, selected) ?? scene.layers[0],
	);
	const name = layer.kind === "image" ? "Develop" : layer.name;
	return (
		<PanelContent>
			<div className="flex min-h-0 flex-1 flex-col divide-y divide-black/50">
				<div
					{...gesture}
					className="flex h-10 shrink-0 items-center justify-between gap-2 px-3"
				>
					<h2 className="truncate text-xs font-medium text-neutral-200">
						{name}
					</h2>
					{layer.kind !== "image" && (
						<div className="flex items-center gap-0.5 text-[11px] text-neutral-500">
							<ScrubInput
								label="Opacity"
								aria-label="Opacity"
								variant="text"
								value={layer.opacity * 100}
								min={0}
								max={100}
								onChange={(value) =>
									setLayer(document, layer.id, { opacity: value / 100 })
								}
								className="gap-1 text-[11px] [&>span]:w-9"
							/>
							%
						</div>
					)}
				</div>
				<div
					{...gesture}
					className="divide-y divide-black [&>section:first-child]:shadow-none"
				>
					<SelectedControls key={layer.id} layer={layer} />
				</div>
			</div>
		</PanelContent>
	);
}
