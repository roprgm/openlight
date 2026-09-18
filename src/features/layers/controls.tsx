import { type ReactNode, useState } from "react";
import { useStore } from "zustand";
import { useDocument, useScene } from "@/components/editor/session";
import { Icon } from "@/components/icons/icon";
import Button from "@/components/ui/button";
import { ScrubInput } from "@/components/ui/scrub-input";
import { Slider } from "@/components/ui/slider";
import type { EffectLayer } from "@/core/document";
import { useEditGesture } from "@/hooks/use-edit-gesture";
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
import { ImageThumbnail, MaskThumbnail } from "./thumbnails";

function Eye() {
	return (
		<Icon className="size-3.5">
			<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
			<circle cx="12" cy="12" r="3" />
		</Icon>
	);
}

function LayerAction({
	label,
	disabled,
	onClick,
	children,
}: {
	label: string;
	disabled?: boolean;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<Button
			aria-label={label}
			title={label}
			variant="ghost"
			disabled={disabled}
			onClick={onClick}
			className="grid size-7 place-items-center rounded-sm p-0 disabled:pointer-events-none disabled:opacity-25 pointer-coarse:size-11"
		>
			<Icon className="size-3.5">{children}</Icon>
		</Button>
	);
}

function LayerName({
	layer,
	onSelect,
}: {
	layer: EffectLayer;
	onSelect: () => void;
}) {
	const document = useDocument();
	const [renaming, setRenaming] = useState(false);
	if (renaming) {
		return (
			<input
				aria-label="Layer name"
				ref={(input) => input?.select()}
				defaultValue={layer.name}
				className="ml-2 min-w-0 flex-1 border border-neutral-500 bg-neutral-900 px-1 text-xs text-neutral-100 outline-none"
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
					if (name && name !== layer.name) {
						setLayer(document, layer.id, { name });
					}
					setRenaming(false);
				}}
			/>
		);
	}
	return (
		<button
			type="button"
			aria-label={`${layer.name}${layer.mask ? " Gradient" : ""}`}
			title="Double-click to rename"
			onClick={onSelect}
			onDoubleClick={() => setRenaming(true)}
			className="ml-2 min-w-0 flex-1 self-stretch truncate text-left text-xs"
		>
			{layer.name}
		</button>
	);
}

export function LayersControls({ onSelect }: { onSelect?: () => void }) {
	const document = useDocument();
	const scene = useScene((scene) => scene);
	const selected = useStore(document.selection, (state) => state.layerId);
	const layer = scene.layers.find((layer) => layer.id === selected);
	const index = scene.layers.findIndex((layer) => layer.id === selected);
	const size = document.resources.get(scene.image.source).image.size;
	const gesture = useEditGesture(document.history);
	const tool = useGradientTool();
	function select(id: string) {
		tool.close();
		document.selectLayer(id);
		onSelect?.();
	}
	function add(kind: EffectLayer["kind"]) {
		select(addLayer(document, kind));
	}
	return (
		<section
			aria-label="Layers"
			onKeyDown={(event) => {
				if (
					event.key === "Enter" ||
					(event.key === "Escape" && event.target instanceof HTMLInputElement)
				) {
					event.stopPropagation();
				}
			}}
			className="flex max-h-[42%] shrink-0 flex-col border-t border-black bg-neutral-900"
		>
			<div
				className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-black/60 px-2"
				{...gesture}
			>
				<h2 className="text-xs font-medium text-neutral-200">Layers</h2>
				<div className="flex items-center gap-0.5 text-[11px] text-neutral-500">
					<ScrubInput
						label="Opacity"
						aria-label="Opacity"
						variant="text"
						value={(layer?.opacity ?? 1) * 100}
						min={0}
						max={100}
						disabled={!layer}
						onChange={(value) => {
							if (layer) {
								setLayer(document, layer.id, { opacity: value / 100 });
							}
						}}
						className="gap-1 text-[11px] [&>span]:w-9"
					/>
					%
				</div>
			</div>
			<div className="min-h-0 overflow-y-auto py-0.5">
				{scene.layers.toReversed().map((layer) => (
					<div
						key={layer.id}
						data-selected={selected === layer.id}
						className="flex h-11 items-center pr-2 text-neutral-300 data-[selected=true]:bg-neutral-700/70 data-[selected=true]:shadow-[inset_2px_0_0_#d4d4d4]"
					>
						<button
							type="button"
							aria-label={`Show ${layer.name}`}
							aria-pressed={layer.visible}
							title={layer.visible ? "Hide layer" : "Show layer"}
							onClick={() =>
								setLayer(document, layer.id, { visible: !layer.visible })
							}
							className="grid h-full w-8 shrink-0 place-items-center text-neutral-400 hover:text-neutral-100 aria-[pressed=false]:text-transparent hover:aria-[pressed=false]:text-neutral-600 pointer-coarse:w-11"
						>
							<Eye />
						</button>
						<button
							type="button"
							aria-label={`Select ${layer.name}`}
							onClick={() => select(layer.id)}
							className="flex w-18 shrink-0 items-center gap-2 text-neutral-300"
						>
							<span className="grid size-8 shrink-0 place-items-center rounded-sm border border-neutral-600 bg-neutral-800">
								<Icon className="size-4">
									<circle cx="12" cy="12" r="8" />
									{layer.kind === "exposure" ? (
										<path
											d="M12 4a8 8 0 0 1 0 16Z"
											fill="currentColor"
											stroke="none"
										/>
									) : (
										<circle
											cx="12"
											cy="12"
											r="3"
											fill="currentColor"
											stroke="none"
										/>
									)}
								</Icon>
							</span>
							{layer.mask && (
								<MaskThumbnail mask={layer.mask} size={[size[0], size[1]]} />
							)}
						</button>
						<LayerName layer={layer} onSelect={() => select(layer.id)} />
					</div>
				))}
				<button
					type="button"
					aria-label="Original Image · Develop"
					aria-pressed={selected === scene.image.id}
					onClick={() => select(scene.image.id)}
					className="flex h-11 w-full items-center pr-2 text-xs text-neutral-300 aria-pressed:bg-neutral-700/70 aria-pressed:shadow-[inset_2px_0_0_#d4d4d4]"
				>
					<span className="grid w-8 shrink-0 place-items-center text-neutral-600 pointer-coarse:w-11">
						<Eye />
					</span>
					<span className="w-18 shrink-0">
						<ImageThumbnail />
					</span>
					<span className="ml-2 min-w-0 flex-1 truncate text-left">
						Original
					</span>
					<Icon className="size-3 text-neutral-500">
						<rect x="6" y="10" width="12" height="10" rx="1" />
						<path d="M8 10V7a4 4 0 0 1 8 0v3" />
					</Icon>
				</button>
			</div>
			<div className="flex shrink-0 items-center justify-between border-t border-black/60 px-1 py-0.5">
				<LayerAction label="+ Exposure" onClick={() => add("exposure")}>
					<circle cx="12" cy="12" r="8" />
					<path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none" />
				</LayerAction>
				<LayerAction label="+ Vignette" onClick={() => add("vignette")}>
					<circle cx="12" cy="12" r="8" />
					<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
				</LayerAction>
				<LayerAction
					label="Move up"
					disabled={!layer || index === scene.layers.length - 1}
					onClick={() => {
						if (layer) {
							moveLayer(document, layer.id, index + 1);
						}
					}}
				>
					<path d="m6 14 6-6 6 6" />
				</LayerAction>
				<LayerAction
					label="Move down"
					disabled={!layer || index === 0}
					onClick={() => {
						if (layer) {
							moveLayer(document, layer.id, index - 1);
						}
					}}
				>
					<path d="m6 10 6 6 6-6" />
				</LayerAction>
				<LayerAction
					label="Duplicate"
					disabled={!layer}
					onClick={() => {
						if (layer) {
							select(duplicateLayer(document, layer.id));
						}
					}}
				>
					<rect x="8" y="8" width="12" height="12" rx="1" />
					<path d="M16 8V4H4v12h4" />
				</LayerAction>
				<LayerAction
					label="Delete"
					disabled={!layer}
					onClick={() => {
						if (layer) {
							deleteLayer(document, layer.id);
						}
					}}
				>
					<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5" />
				</LayerAction>
			</div>
		</section>
	);
}

export function EffectControls({ layer }: { layer: EffectLayer }) {
	const document = useDocument();
	const tool = useGradientTool();
	return (
		<section className="space-y-2 p-3">
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
			<div className="flex items-center gap-1 text-xs">
				<span className="mr-auto text-neutral-500">Mask</span>
				<Button
					variant="ghost"
					className="px-2 py-1"
					aria-label="Draw gradient mask"
					onClick={() => tool.draw(layer.id)}
				>
					{layer.mask ? "Redraw gradient" : "Add gradient"}
				</Button>
				{layer.mask && (
					<Button
						variant="ghost"
						className="px-2 py-1"
						aria-label="Remove mask"
						onClick={() => setLayerMask(document, layer.id)}
					>
						Remove
					</Button>
				)}
			</div>
		</section>
	);
}
