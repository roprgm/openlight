import { useStore } from "zustand";
import { useDocument, useScene } from "@/components/editor/session";
import { Slider } from "@/components/ui/slider";
import { findLayer, locateLayer, type MaskLayer } from "@/core/document";
import { useEditGesture } from "@/hooks/use-edit-gesture";
import { setLayer, setLayerMask, setMaskOperation } from "./edits";
import { useGradientTool } from "./gradient-tool";
import { LayerMenu } from "./menu";

function MaskOptions({ layer }: { layer: MaskLayer }) {
	const document = useDocument();
	const tool = useGradientTool();
	const parent = useScene(
		(scene) => locateLayer(scene.layers, layer.id)?.parent,
	);
	const isSubmask = parent?.kind === "mask";
	return (
		<>
			<hr
				aria-orientation="vertical"
				className="h-4 w-px border-0 bg-white/15"
			/>
			<button
				type="button"
				aria-pressed={tool.overlay !== "hidden"}
				title="Show mask overlay (O)"
				onClick={() =>
					tool.setOverlay(tool.overlay === "hidden" ? "shown" : "hidden")
				}
				className="h-7 rounded-full px-2.5 text-neutral-400 hover:bg-white/10 hover:text-neutral-100 aria-pressed:bg-white/15 aria-pressed:text-neutral-100 pointer-coarse:h-9"
			>
				Overlay
			</button>
			{layer.mask.kind === "radial" && (
				<Slider
					label="Feather"
					value={layer.mask.feather * 100}
					min={0}
					max={100}
					defaultValue={50}
					unit="%"
					variant="toolbar"
					onChange={(value) => {
						if (layer.mask.kind === "radial") {
							setLayerMask(document, layer.id, {
								...layer.mask,
								feather: value / 100,
							});
						}
					}}
				/>
			)}
			{isSubmask && (
				<select
					aria-label="Mask operation"
					title="Combine with the parent mask"
					value={layer.operation}
					className="h-7 rounded-full bg-white/10 px-2.5 text-neutral-200 hover:bg-white/15"
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
			)}
			{!parent &&
				(["add", "subtract"] as const).map((operation) => {
					const label =
						operation === "add" ? "Add to mask" : "Subtract from mask";
					const text = operation === "add" ? "Add" : "Subtract";
					return (
						<LayerMenu
							variant="pill"
							key={operation}
							label={label}
							icon={<span>{text}</span>}
						>
							<button
								type="submit"
								onClick={() => tool.add(layer.id, operation, "linear")}
							>
								Linear gradient
							</button>
							<button
								type="submit"
								onClick={() => tool.add(layer.id, operation, "radial")}
							>
								Radial gradient
							</button>
						</LayerMenu>
					);
				})}
		</>
	);
}

export function LayerToolbar() {
	const document = useDocument();
	const gesture = useEditGesture(document.history);
	const selected = useStore(document.selection, (state) => state.layerId);
	const layer = useScene(
		(scene) => findLayer(scene.layers, selected) ?? scene.layers[0],
	);
	if (layer.kind === "image") {
		return null;
	}
	return (
		<fieldset
			aria-label="Layer options"
			{...gesture}
			className="absolute top-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-3 gap-y-1 rounded-full bg-neutral-800/80 p-1 pl-2.5 text-xs backdrop-blur-sm"
		>
			<Slider
				label="Opacity"
				value={layer.opacity * 100}
				min={0}
				max={100}
				defaultValue={100}
				unit="%"
				variant="toolbar"
				onChange={(value) =>
					setLayer(document, layer.id, { opacity: value / 100 })
				}
			/>
			{layer.kind === "mask" && <MaskOptions layer={layer} />}
		</fieldset>
	);
}
