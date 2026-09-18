import { useStore } from "zustand";
import { useDocument, useScene } from "@/components/editor/session";
import { ScrubInput } from "@/components/ui/scrub-input";
import { findLayer, type MaskLayer, walkLayers } from "@/core/document";
import { useEditGesture } from "@/hooks/use-edit-gesture";
import { setLayer, setLayerMask, setMaskOperation } from "./edits";
import { useGradientTool } from "./gradient-tool";
import { LayerMenu } from "./menu";

function MaskOptions({ layer }: { layer: MaskLayer }) {
	const document = useDocument();
	const tool = useGradientTool();
	const parent = useScene((scene) =>
		walkLayers(scene.layers).find((item) =>
			item.children.some((child) => child.id === layer.id),
		),
	);
	const isSubmask = parent?.kind === "mask";
	return (
		<>
			{layer.mask.kind === "radial" && (
				<ScrubInput
					variant="text"
					className="w-28 gap-2 [&>span]:w-auto"
					label="Feather"
					value={layer.mask.feather * 100}
					min={0}
					max={100}
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
				<label className="flex items-center gap-2 text-xs text-neutral-400">
					Combine
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
			{!parent && (
				<div className="flex items-center gap-1 border-l border-black/50 pl-2">
					{(["add", "subtract"] as const).map((operation) => {
						const label =
							operation === "add" ? "Add to mask" : "Subtract from mask";
						const text = operation === "add" ? "Add" : "Subtract";
						return (
							<LayerMenu
								className="w-auto px-2 pointer-coarse:w-auto"
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
			className="flex min-h-11 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-black bg-panel px-3 py-1 text-xs text-neutral-400 shadow-ridge"
		>
			<span className="max-w-40 truncate text-neutral-300" title={layer.name}>
				{layer.name}
			</span>
			{layer.kind !== "image" && (
				<ScrubInput
					label="Opacity"
					aria-label="Opacity"
					variant="text"
					className="w-28 gap-2 [&>span]:w-auto"
					value={layer.opacity * 100}
					min={0}
					max={100}
					onChange={(value) =>
						setLayer(document, layer.id, { opacity: value / 100 })
					}
				/>
			)}
			{layer.kind === "mask" && <MaskOptions layer={layer} />}
		</fieldset>
	);
}
