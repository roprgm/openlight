import { ChevronDownIcon } from "@/components/icons/chevron-down";
import { FlipIcon } from "@/components/icons/flip";
import { RotateIcon } from "@/components/icons/rotate";
import Button from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";
import {
	type CropDraft,
	cropSize,
	fitAspect,
	flipCrop,
	orientedSize,
	rotateCrop,
} from "./geometry";
import type { CropTool } from "./tool";

const actions = [
	{ label: "Rotate counterclockwise", turn: -1, transform: "scaleX(-1)" },
	{ label: "Rotate clockwise", turn: 1, transform: "" },
	{ label: "Flip horizontal", flip: "horizontal", transform: "" },
	{ label: "Flip vertical", flip: "vertical", transform: "rotate(90deg)" },
] as const;

type CropPanelProps = {
	tool: CropTool;
	crop: CropDraft;
	onApply: () => void;
	onResetView: () => void;
};

export function CropPanel({
	tool,
	crop,
	onApply,
	onResetView,
}: CropPanelProps) {
	const { geometry, aspect } = crop;
	const [width, height] = orientedSize(tool.size, geometry.rotation);
	const aspects = {
		Original: width / height,
		Square: 1,
		"4:3": 4 / 3,
		"3:2": 3 / 2,
		"16:9": 16 / 9,
		"4:5": 4 / 5,
		"9:16": 9 / 16,
		"3:4": 3 / 4,
		"2:3": 2 / 3,
		"5:4": 5 / 4,
	};
	const custom = aspect !== null && !Object.values(aspects).includes(aspect);
	function changeAspect(value: string) {
		const aspect = Number(value) || null;
		const fitted = aspect
			? fitAspect(geometry, (aspect * height) / width)
			: geometry;
		tool.change(fitted, aspect);
	}
	function applyAction(action: (typeof actions)[number]) {
		if ("turn" in action) {
			tool.change(rotateCrop(geometry, action.turn), aspect && 1 / aspect);
		} else {
			tool.change(flipCrop(geometry, action.flip));
		}
	}

	return (
		<section aria-label="Crop tool" className="flex h-full flex-col bg-panel">
			<div className="flex-1 space-y-5 overflow-y-auto p-4">
				<h2 className="text-sm text-neutral-100">Crop & rotate</h2>
				<label className="flex items-center justify-between text-sm text-neutral-400">
					Aspect ratio
					<Field className="relative w-24">
						<select
							aria-label="Aspect ratio"
							value={aspect ?? "free"}
							className="w-full cursor-pointer appearance-none bg-transparent pl-1 pr-5 text-neutral-100 outline-none [color-scheme:dark]"
							onChange={(event) => changeAspect(event.currentTarget.value)}
						>
							<option value="free">Free</option>
							{custom && <option value={aspect}>Current</option>}
							{Object.entries(aspects).map(([label, value]) => (
								<option key={label} value={value}>
									{label}
								</option>
							))}
						</select>
						<ChevronDownIcon className="pointer-events-none absolute top-1/2 right-1.5 size-3 -translate-y-1/2" />
					</Field>
				</label>
				<section aria-label="Rotate and flip image" className="space-y-2">
					<div className="flex items-center justify-between">
						<h3 className="text-xs font-medium text-neutral-400">
							Rotate & flip
						</h3>
						<Button
							variant="ghost"
							className="px-2 py-1 text-xs"
							onClick={() => {
								tool.reset();
								onResetView();
							}}
						>
							Reset
						</Button>
					</div>
					<div className="flex gap-2">
						{actions.map((action) => {
							const turning = "turn" in action;
							const Icon = turning ? RotateIcon : FlipIcon;
							return (
								<Button
									key={action.label}
									variant="ghost"
									aria-label={action.label}
									title={action.label}
									className="flex h-9 flex-1 items-center justify-center gap-1 rounded-md px-1"
									onClick={() => applyAction(action)}
								>
									<Icon style={{ transform: action.transform }} />
									{turning && <span className="text-xs">90°</span>}
								</Button>
							);
						})}
					</div>
				</section>
				<Slider
					label="Rotation"
					min={-45}
					max={45}
					step={0.1}
					value={geometry.angle}
					defaultValue={0}
					onChange={(angle) => tool.change({ angle })}
				/>
				<p className="text-xs text-neutral-500">
					Drag corners to crop, inside to move, outside to rotate. Space + drag
					to pan; Ctrl/⌘ + scroll to zoom.
				</p>
				<p className="text-xs tabular-nums text-neutral-400">
					{cropSize(tool.size, geometry).join(" × ")} px
				</p>
			</div>
			<div className="flex justify-end gap-2 border-t border-black p-3">
				<Button
					variant="ghost"
					className="px-3 py-1.5 text-xs"
					onClick={tool.cancel}
				>
					Cancel
				</Button>
				<Button onClick={onApply}>Apply crop</Button>
			</div>
		</section>
	);
}
