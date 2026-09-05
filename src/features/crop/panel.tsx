import { useEffect } from "react";
import Button from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";
import {
	type CropDraft,
	cropSize,
	defaultGeometry,
	fitAspect,
	flipCrop,
	type Geometry,
	orientedSize,
	rotateCrop,
} from "./geometry";

const rotations = [
	{
		direction: -1,
		label: "Rotate counterclockwise",
		transform: "translate(24 0) scale(-1 1)",
	},
	{
		direction: 1,
		label: "Rotate clockwise",
		transform: "",
	},
] as const;

type CropPanelProps = {
	crop: CropDraft;
	size: readonly number[];
	onChange: (change: Partial<Geometry>, aspect?: number | null) => void;
	onApply: () => void;
	onCancel: () => void;
	onResetView: () => void;
};

export function CropPanel({
	crop,
	size,
	onChange,
	onApply,
	onCancel,
	onResetView,
}: CropPanelProps) {
	useEffect(() => {
		function keyDown(event: KeyboardEvent) {
			if (event.isComposing || event.repeat) {
				return;
			}
			if (event.key === "Escape") {
				event.preventDefault();
				onCancel();
			}
			if (event.key === "Enter") {
				event.preventDefault();
				onApply();
			}
		}
		window.addEventListener("keydown", keyDown);
		return () => window.removeEventListener("keydown", keyDown);
	}, [onApply, onCancel]);
	const { geometry, aspect } = crop;
	const [width, height] = orientedSize(size, geometry.rotation);
	const [outputWidth, outputHeight] = cropSize(size, geometry);
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
	const customAspect =
		aspect !== null && !Object.values(aspects).includes(aspect);
	function changeAspect(value: string) {
		const ratio = value === "free" ? null : Number(value);
		const rect = ratio
			? fitAspect(geometry, (ratio * height) / width)
			: geometry;
		onChange(rect, ratio);
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
							onChange={(event) => changeAspect(event.currentTarget.value)}
							className="w-full cursor-pointer appearance-none bg-transparent pl-1 pr-5 text-neutral-100 outline-none [color-scheme:dark]"
						>
							<option value="free">Free</option>
							{customAspect && <option value={aspect ?? ""}>Current</option>}
							{Object.entries(aspects).map(([label, value]) => (
								<option key={label} value={value}>
									{label}
								</option>
							))}
						</select>
						<svg
							aria-hidden="true"
							viewBox="0 0 12 12"
							className="pointer-events-none absolute top-1/2 right-1.5 size-3 -translate-y-1/2 text-neutral-400"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="m3 4.5 3 3 3-3" />
						</svg>
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
								onChange(defaultGeometry, size[0] / size[1]);
								onResetView();
							}}
						>
							Reset
						</Button>
					</div>
					<div className="flex gap-2">
						{rotations.map(({ direction, label, transform }) => (
							<Button
								key={direction}
								variant="ghost"
								aria-label={label}
								title={`${label} (90°)`}
								className="flex h-9 flex-1 items-center justify-center gap-1 rounded-md px-1"
								onClick={() =>
									onChange(
										rotateCrop(geometry, direction),
										aspect && 1 / aspect,
									)
								}
							>
								<svg
									aria-hidden="true"
									viewBox="0 0 24 24"
									className="size-5"
									fill="none"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<g transform={transform}>
										<path d="M4 12a8 8 0 0 1 14-5" />
										<path d="M4 12a8 8 0 0 0 16 0" strokeDasharray="0.1 3.5" />
										<path d="M20 3v6h-6z" fill="currentColor" stroke="none" />
									</g>
								</svg>
								<span className="text-xs">90°</span>
							</Button>
						))}
						{(["horizontal", "vertical"] as const).map((axis) => (
							<Button
								key={axis}
								variant="ghost"
								aria-label={`Flip ${axis}`}
								title={`Flip ${axis}`}
								className="flex h-9 flex-1 items-center justify-center rounded-md px-1"
								onClick={() => onChange(flipCrop(geometry, axis, size))}
							>
								<svg
									aria-hidden="true"
									viewBox="0 0 24 24"
									className="size-5"
									fill="none"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinejoin="round"
									style={{ rotate: axis === "vertical" ? "90deg" : undefined }}
								>
									<path d="M9 5 3 12l6 7Z" fill="currentColor" stroke="none" />
									<path d="m15 5 6 7-6 7Z" />
									<path d="M12 3v18" strokeDasharray="1 3" />
								</svg>
							</Button>
						))}
					</div>
				</section>
				<Slider
					label="Rotation"
					min={-45}
					max={45}
					step={0.1}
					value={geometry.angle}
					defaultValue={0}
					onChange={(angle) => onChange({ angle })}
				/>
				<p className="text-xs text-neutral-500">
					Drag corners to crop, inside to move the image, or well outside to
					rotate. Scroll to pan; Ctrl/⌘ + scroll to zoom. Enter to apply.
				</p>
				<p className="text-xs tabular-nums text-neutral-400">
					{outputWidth} × {outputHeight} px
				</p>
			</div>
			<div className="flex justify-end gap-2 border-t border-black p-3">
				<Button
					variant="ghost"
					className="px-3 py-1.5 text-xs"
					onClick={onCancel}
				>
					Cancel
				</Button>
				<Button onClick={onApply}>Apply crop</Button>
			</div>
		</section>
	);
}
