import { useEffect } from "react";
import { useStore } from "zustand";
import { useDocument } from "@/app/document/provider";
import Button from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";
import {
	cropSize,
	defaultGeometry,
	fitAspect,
	fullRect,
	orientedSize,
	rotateCrop,
} from "@/features/crop/geometry";
import { applyCrop, cancelCrop, updateCrop } from "./actions";

const rotations = [
	{ direction: -1, label: "Rotate counterclockwise", transform: "" },
	{
		direction: 1,
		label: "Rotate clockwise",
		transform: "translate(20 0) scale(-1 1)",
	},
] as const;

export function CropPanel() {
	const document = useDocument();
	const crop = useStore(document.preview, (state) => state.crop);
	useEffect(() => {
		function keyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				event.preventDefault();
				cancelCrop(document);
			}
			if (
				event.key === "Enter" &&
				!(
					event.target instanceof HTMLElement &&
					event.target.closest("input, select, button")
				)
			) {
				event.preventDefault();
				applyCrop(document);
			}
		}
		window.addEventListener("keydown", keyDown);
		return () => window.removeEventListener("keydown", keyDown);
	}, [document]);
	if (!crop) {
		return null;
	}
	const { geometry, aspect } = crop;
	const source = document.resources.get(document.scene.getState().source).image;
	const [width, height] = orientedSize(source.size, geometry.rotation);
	const [outputWidth, outputHeight] = cropSize(source.size, geometry);
	const customAspect =
		aspect !== null &&
		![
			width / height,
			1,
			4 / 3,
			3 / 2,
			16 / 9,
			4 / 5,
			9 / 16,
			3 / 4,
			2 / 3,
			5 / 4,
		].includes(aspect);
	function changeAspect(value: string) {
		const ratio = value === "free" ? null : Number(value);
		const rect = ratio
			? fitAspect(geometry, (ratio * height) / width)
			: geometry;
		updateCrop(document, rect, ratio);
	}
	return (
		<section
			aria-label="Crop tool"
			className="flex h-full flex-col bg-neutral-900"
		>
			<div className="flex-1 space-y-5 overflow-y-auto p-4">
				<div className="flex items-center justify-between">
					<h2 className="text-sm text-neutral-100">Crop & rotate</h2>
					<Button
						variant="ghost"
						className="px-2 py-1 text-xs"
						onClick={() =>
							updateCrop(
								document,
								defaultGeometry,
								source.size[0] / source.size[1],
							)
						}
					>
						Reset
					</Button>
				</div>
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
							<option value={width / height}>Original</option>
							<option value={1}>Square</option>
							<option value={4 / 3}>4:3</option>
							<option value={3 / 2}>3:2</option>
							<option value={16 / 9}>16:9</option>
							<option value={4 / 5}>4:5</option>
							<option value={9 / 16}>9:16</option>
							<option value={3 / 4}>3:4</option>
							<option value={2 / 3}>2:3</option>
							<option value={5 / 4}>5:4</option>
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
				<div className="flex gap-2">
					{rotations.map(({ direction, label, transform }) => (
						<Button
							key={direction}
							variant="ghost"
							aria-label={label}
							title={`${label} (90°)`}
							className="flex size-8 items-center justify-center rounded-md p-0"
							onClick={() =>
								updateCrop(
									document,
									rotateCrop(geometry, direction),
									aspect && 1 / aspect,
								)
							}
						>
							<svg
								aria-hidden="true"
								viewBox="0 0 20 20"
								className="size-4"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<path transform={transform} d="M3 3v5h5M3 8a7 7 0 1 1 0 4" />
							</svg>
						</Button>
					))}
					<Button
						variant="ghost"
						className="ml-auto py-1.5 text-xs"
						onClick={() => updateCrop(document, fullRect, width / height)}
					>
						Uncrop
					</Button>
				</div>
				<Slider
					label="Straighten"
					min={-45}
					max={45}
					step={0.1}
					value={geometry.angle}
					defaultValue={0}
					onChange={(angle) => updateCrop(document, { angle })}
				/>
				<p className="text-xs text-neutral-500">
					Drag corners to crop. Drag inside to reposition. Scroll to pan; Ctrl/⌘
					+ scroll to zoom.
				</p>
				<p className="text-xs tabular-nums text-neutral-400">
					{outputWidth} × {outputHeight} px
				</p>
			</div>
			<div className="flex justify-end gap-2 border-t border-black p-3">
				<Button
					variant="ghost"
					className="px-3 py-1.5 text-xs"
					onClick={() => cancelCrop(document)}
				>
					Cancel
				</Button>
				<Button
					className="px-4 py-1.5 text-xs"
					onClick={() => applyCrop(document)}
				>
					Apply crop
				</Button>
			</div>
		</section>
	);
}
