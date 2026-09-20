import { type ComponentProps, useEffect, useState } from "react";
import { useStore } from "zustand";
import { useDocument, useScene } from "@/components/editor/session";
import { Icon } from "@/components/icons/icon";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	TreeDrag,
	type TreeDrop,
	useTreeDragItem,
} from "@/components/ui/tree-drag";
import {
	type EffectLayer,
	findLayer,
	type Layer,
	type ProcessingLayer,
} from "@/core/document";
import type { Point } from "@/core/image/frame";
import { layerDrop } from "./drop";
import { moveLayer, setLayer } from "./edits";
import { useGradientTool } from "./gradient-tool";
import { LayerActions, LayerMenu } from "./menu";
import { ImageThumbnail, MaskThumbnail } from "./thumbnails";

function EffectSymbol({ kind }: { kind: ProcessingLayer["kind"] }) {
	switch (kind) {
		case "color-mixer":
			return (
				<>
					<circle cx="9" cy="9" r="5" />
					<circle cx="15" cy="9" r="5" />
					<circle cx="12" cy="15" r="5" />
				</>
			);
		case "details":
			return <path d="m4 18 8-14 8 14H4Zm8-8v6" />;
		case "vignette":
			return (
				<>
					<circle cx="12" cy="12" r="8" />
					<circle cx="12" cy="12" r="3" />
				</>
			);
		default:
			return (
				<>
					<circle cx="12" cy="12" r="8" />
					<path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none" />
				</>
			);
	}
}

function LayerThumbnail({ layer, size }: { layer: Layer; size: Point }) {
	if (layer.kind === "image") {
		return <ImageThumbnail />;
	}
	if (layer.kind === "mask") {
		return <MaskThumbnail mask={layer.mask} size={size} />;
	}
	return (
		<span className="grid size-8 shrink-0 place-items-center rounded border border-black/50 bg-neutral-950/40 text-neutral-400">
			<Icon className="size-4">
				<EffectSymbol kind={layer.kind} />
			</Icon>
		</span>
	);
}

function LayerName({
	layer,
	onSelect,
	dragHandle,
}: {
	layer: Layer;
	onSelect: () => void;
	dragHandle: ComponentProps<"button">;
}) {
	const document = useDocument();
	const [renaming, setRenaming] = useState(false);
	if (renaming) {
		return (
			<input
				aria-label="Layer name"
				ref={(input) => input?.select()}
				defaultValue={layer.name}
				className="min-w-0 flex-1 rounded border border-neutral-500 bg-neutral-900 px-1 text-xs text-neutral-100 outline-none"
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
	function rename() {
		if (layer.kind !== "image") {
			setRenaming(true);
		}
	}
	return (
		<button
			{...dragHandle}
			type="button"
			aria-label={layer.name}
			title={layer.name}
			onClick={onSelect}
			onDoubleClick={rename}
			className="min-w-0 flex-1 self-stretch truncate text-left text-xs touch-manipulation cursor-grab active:cursor-grabbing"
		>
			{layer.name}
		</button>
	);
}

function LayerRow({
	layer,
	siblings,
	parent,
	depth,
	selected,
	size,
	onSelect,
}: {
	layer: Layer;
	siblings: readonly Layer[];
	parent?: Layer;
	depth: number;
	selected: string;
	size: Point;
	onSelect: (id: string) => void;
}) {
	const document = useDocument();
	const [collapsed, setCollapsed] = useState(false);
	const isImage = layer.kind === "image";
	const visible = isImage || layer.visible;
	useEffect(() => {
		if (findLayer(layer.children, selected)) {
			setCollapsed(false);
		}
	}, [layer.children, selected]);
	const expanded = !collapsed;
	const drag = useTreeDragItem(layer.id, {
		disabled: isImage,
		expanded: expanded && layer.children.length > 0,
	});
	const dragHandle = isImage ? {} : drag.handle;
	const chevronStyle = { transform: expanded ? "rotate(90deg)" : undefined };
	const isSubmask = layer.kind === "mask" && parent?.kind === "mask";
	const maskSign =
		layer.kind === "mask" && layer.operation === "subtract" ? "−" : "+";
	let expandLabel = `Expand ${layer.name}`;
	if (expanded) {
		expandLabel = `Collapse ${layer.name}`;
	}
	return (
		<>
			<div
				ref={drag.ref}
				data-drop={drag.drop}
				data-dragging={drag.dragging}
				data-selected={selected === layer.id}
				data-hidden={!visible}
				style={{ paddingLeft: depth * 12 }}
				className="group relative mb-0.5 flex h-9.5 items-center last:mb-0 pointer-coarse:h-11 rounded-md pr-1 text-neutral-300 data-[selected=false]:hover:bg-white/5 data-[selected=true]:bg-neutral-700 data-[hidden=true]:text-neutral-500 data-[dragging=true]:opacity-40 data-[drop=inside]:ring-1 data-[drop=inside]:ring-blue-400 data-[drop=before]:before:absolute data-[drop=before]:before:inset-x-0 data-[drop=before]:before:-top-px data-[drop=before]:before:border-t-2 data-[drop=before]:before:border-blue-400 data-[drop=after]:after:absolute data-[drop=after]:after:inset-x-0 data-[drop=after]:after:-bottom-px data-[drop=after]:after:border-b-2 data-[drop=after]:after:border-blue-400"
			>
				<button
					type="button"
					aria-label={`Show ${layer.name}`}
					aria-pressed={visible}
					disabled={isImage}
					onClick={() => {
						if (!isImage) {
							setLayer(document, layer.id, { visible: !visible });
						}
					}}
					className="grid h-full w-8 shrink-0 place-items-center text-neutral-400 hover:text-neutral-100 disabled:text-neutral-600 aria-[pressed=false]:text-neutral-600 pointer-coarse:w-11"
				>
					<Icon className="size-3.5">
						<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
						<circle cx="12" cy="12" r="3" />
					</Icon>
				</button>
				<button
					type="button"
					aria-label={`Select ${layer.name}`}
					onClick={() => onSelect(layer.id)}
					className="mr-2 shrink-0"
				>
					<LayerThumbnail layer={layer} size={size} />
				</button>
				<LayerName
					layer={layer}
					onSelect={() => onSelect(layer.id)}
					dragHandle={dragHandle}
				/>
				{isSubmask && (
					<span
						title={layer.operation}
						className="grid size-6 shrink-0 place-items-center text-sm text-neutral-500"
					>
						{maskSign}
					</span>
				)}
				{layer.children.length > 0 && (
					<button
						type="button"
						aria-label={expandLabel}
						aria-expanded={expanded}
						onClick={() => setCollapsed(expanded)}
						className="grid size-6 shrink-0 place-items-center text-neutral-500 hover:text-neutral-200"
					>
						<Icon className="size-3 transition-transform" style={chevronStyle}>
							<path d="m9 5 7 7-7 7" />
						</Icon>
					</button>
				)}
				{layer.kind === "image" && (
					<span
						title="Base image is locked"
						className="grid size-7 shrink-0 place-items-center text-neutral-500"
					>
						<Icon className="size-3.5">
							<rect x="6" y="10" width="12" height="10" rx="2" />
							<path d="M8 10V7a4 4 0 0 1 8 0v3" />
						</Icon>
					</span>
				)}
				{layer.kind !== "image" && (
					<LayerActions
						layer={layer}
						siblings={siblings}
						parent={parent}
						onSelect={onSelect}
					/>
				)}
			</div>
			{expanded &&
				layer.children
					.toReversed()
					.map((child) => (
						<LayerRow
							key={child.id}
							layer={child}
							siblings={layer.children}
							parent={layer}
							depth={depth + 1}
							selected={selected}
							size={size}
							onSelect={onSelect}
						/>
					))}
		</>
	);
}

export function LayersControls({
	onSelect,
	onAdd,
}: {
	onSelect: () => void;
	onAdd: (kind: EffectLayer["kind"]) => void;
}) {
	const document = useDocument();
	const scene = useScene((scene) => scene);
	const selected = useStore(document.selection, (state) => state.layerId);
	const size = document.resources.get(scene.layers[0].source).image.size;
	const tool = useGradientTool();
	function select(id: string) {
		tool.close();
		document.selectLayer(id);
		onSelect();
	}
	function add(kind: EffectLayer["kind"]) {
		onAdd(kind);
		onSelect();
	}
	function drop(target: TreeDrop) {
		const position = layerDrop(document.scene.getState(), target);
		if (position) {
			moveLayer(document, target.id, position.index, position.parentId);
			select(target.id);
		}
	}

	return (
		<section
			aria-label="Layers"
			className="flex h-[30%] min-h-24 max-h-72 shrink-0 flex-col border-t border-black bg-panel shadow-ridge"
			onKeyDown={(event) => {
				// Crop's Enter and Escape shortcuts listen on inputs too; keep rename and menu keys local.
				const menu = event.currentTarget.querySelector<HTMLElement>(
					"[popover]:popover-open",
				);
				if (event.key === "Escape" && menu) {
					menu.hidePopover();
					event.stopPropagation();
					return;
				}
				if (
					(event.key === "Enter" || event.key === "Escape") &&
					event.target instanceof HTMLInputElement
				) {
					event.stopPropagation();
				}
			}}
		>
			<div className="flex h-10 shrink-0 items-center gap-1 border-b border-black/50 pr-2 pl-3">
				<h2 className="mr-auto text-xs font-medium text-neutral-200">Layers</h2>
				<button
					type="button"
					aria-label="Add linear mask"
					title="Draw a linear mask (L)"
					onClick={() => {
						onSelect();
						tool.draw();
					}}
					className="grid size-7 place-items-center rounded text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100 pointer-coarse:size-10"
				>
					<Icon className="size-4">
						<rect x="4" y="4" width="16" height="16" rx="2" />
						<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
					</Icon>
				</button>
				<button
					type="button"
					aria-label="Add radial mask"
					title="Draw a radial mask (R)"
					onClick={() => {
						onSelect();
						tool.draw("radial");
					}}
					className="grid size-7 place-items-center rounded text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100 pointer-coarse:size-10"
				>
					<Icon className="size-4">
						<ellipse cx="12" cy="12" rx="9" ry="6" />
						<circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
					</Icon>
				</button>
				<LayerMenu
					label="Add effect"
					icon={
						<Icon className="size-4">
							<path d="M12 4v16M4 12h16" />
						</Icon>
					}
				>
					<button type="submit" onClick={() => add("details")}>
						Details
					</button>
					<button type="submit" onClick={() => add("exposure")}>
						Exposure
					</button>
					<button type="submit" onClick={() => add("color-mixer")}>
						Color Mixer
					</button>
					<button type="submit" onClick={() => add("vignette")}>
						Vignette
					</button>
				</LayerMenu>
			</div>
			<ScrollArea fade className="flex-1" viewportClassName="px-2 py-1.5">
				<TreeDrag
					canDrop={(target) => Boolean(layerDrop(scene, target))}
					onDrop={drop}
					label={(id) => findLayer(scene.layers, id)?.name ?? id}
				>
					{scene.layers.toReversed().map((layer) => (
						<LayerRow
							key={layer.id}
							layer={layer}
							siblings={scene.layers}
							depth={0}
							selected={selected}
							size={[size[0], size[1]]}
							onSelect={select}
						/>
					))}
				</TreeDrag>
			</ScrollArea>
		</section>
	);
}
