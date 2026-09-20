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
				<label className="flex flex-col gap-1 text-neutral-500 text-xs">
					<span>Combine</span>
					<select
						aria-label="Mask operation"
						value={layer.operation}
						className="h-7 rounded border border-black bg-neutral-800 px-2 text-neutral-200 shadow-groove"
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
			{!parent && (
				<div className="flex flex-col gap-0.5 text-neutral-500 text-xs">
					<span>Mask</span>
					<div className="flex items-center gap-1">
						{(["add", "subtract"] as const).map((operation) => {
							const label =
								operation === "add" ? "Add to mask" : "Subtract from mask";
							const text = operation === "add" ? "Add" : "Subtract";
							return (
								<LayerMenu
									className="h-7 w-auto px-2 pointer-coarse:h-10 pointer-coarse:w-auto"
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
					</div>
				</div>
			)}
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
	return (
		<fieldset
			aria-label="Layer options"
			{...gesture}
			className="flex h-16 min-w-0 shrink-0 items-center gap-4 overflow-x-auto border-b border-black bg-panel px-3 shadow-ridge [&>*]:shrink-0"
		>
			<div className="flex min-w-24 max-w-40 flex-col gap-0.5">
				<span className="text-neutral-500 text-xs">Layer</span>
				<span className="truncate text-neutral-200 text-sm" title={layer.name}>
					{layer.name}
				</span>
			</div>
			{layer.kind !== "image" && (
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
			)}
			{layer.kind === "mask" && <MaskOptions layer={layer} />}
		</fieldset>
	);
}
