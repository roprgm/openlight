import {
	type ComponentProps,
	memo,
	useCallback,
	useEffect,
	useState,
} from "react";
import { useStore } from "zustand";
import { PanelHeader } from "@/components/editor/panel";
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

function LayerThumbnail({ layer }: { layer: Layer }) {
	if (layer.kind === "image") {
		return <ImageThumbnail />;
	}
	if (layer.kind === "mask") {
		return <MaskThumbnail mask={layer.mask} />;
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
				className="min-w-0 flex-1 rounded border border-neutral-500 bg-neutral-900 px-1 text-neutral-100 outline-none"
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
			className="min-w-0 flex-1 self-stretch truncate text-left touch-manipulation cursor-grab active:cursor-grabbing"
		>
			{layer.name}
		</button>
	);
}

/** Rows subscribe to selection themselves, so unchanged branches skip when a sibling edits. */
const LayerRow = memo(function LayerRow({
	layer,
	parent,
	depth,
	onSelect,
}: {
	layer: Layer;
	parent?: Layer;
	depth: number;
	onSelect: (id: string) => void;
}) {
	const document = useDocument();
	const selected = useStore(document.selection, (state) => state.layerId);
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
	const expandLabel = `${expanded ? "Collapse" : "Expand"} ${layer.name}`;
	return (
		<>
			<div
				ref={drag.ref}
				data-drop={drag.drop}
				data-dragging={drag.dragging}
				data-selected={selected === layer.id}
				data-hidden={!visible}
				style={{ paddingLeft: depth * 12 }}
				className="group relative flex h-10 items-center border-b border-black/50 pr-1 text-neutral-300 pointer-coarse:h-12 data-[selected=false]:hover:bg-white/5 data-[selected=true]:bg-neutral-700 data-[hidden=true]:text-neutral-500 data-[dragging=true]:opacity-40 data-[drop=inside]:ring-1 data-[drop=inside]:ring-blue-400 data-[drop=inside]:ring-inset data-[drop=before]:before:absolute data-[drop=before]:before:inset-x-0 data-[drop=before]:before:-top-px data-[drop=before]:before:border-t-2 data-[drop=before]:before:border-blue-400 data-[drop=after]:after:absolute data-[drop=after]:after:inset-x-0 data-[drop=after]:after:-bottom-px data-[drop=after]:after:border-b-2 data-[drop=after]:after:border-blue-400"
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
					<LayerThumbnail layer={layer} />
				</button>
				<LayerName
					layer={layer}
					onSelect={() => onSelect(layer.id)}
					dragHandle={dragHandle}
				/>
				{isSubmask && (
					<span
						title={layer.operation}
						className="grid size-6 shrink-0 place-items-center text-neutral-500"
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
					<LayerActions layer={layer} onSelect={onSelect} />
				)}
			</div>
			{expanded &&
				layer.children
					.toReversed()
					.map((child) => (
						<LayerRow
							key={child.id}
							layer={child}
							parent={layer}
							depth={depth + 1}
							onSelect={onSelect}
						/>
					))}
		</>
	);
});

export function LayersControls({
	onAdd,
}: {
	onAdd: (kind: EffectLayer["kind"]) => void;
}) {
	const document = useDocument();
	const layers = useScene((scene) => scene.layers);
	const tool = useGradientTool();
	const { close } = tool;
	const select = useCallback(
		(id: string) => {
			close();
			document.selectLayer(id);
		},
		[close, document],
	);
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
			className="grid max-h-1/2 min-h-30 shrink-0 grid-rows-[auto_minmax(0,1fr)] border-t border-black bg-panel"
		>
			<PanelHeader title="Layers">
				<button
					type="button"
					aria-label="Add linear mask"
					title="Draw a linear mask (L)"
					onClick={() => tool.draw()}
					className="grid size-7 place-items-center rounded-md text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100 pointer-coarse:size-10"
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
					onClick={() => tool.draw("radial")}
					className="grid size-7 place-items-center rounded-md text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100 pointer-coarse:size-10"
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
					<button type="submit" onClick={() => onAdd("details")}>
						Details
					</button>
					<button type="submit" onClick={() => onAdd("exposure")}>
						Exposure
					</button>
					<button type="submit" onClick={() => onAdd("color-mixer")}>
						Color Mixer
					</button>
					<button type="submit" onClick={() => onAdd("vignette")}>
						Vignette
					</button>
				</LayerMenu>
			</PanelHeader>
			<ScrollArea fade>
				<TreeDrag
					canDrop={(target) =>
						Boolean(layerDrop(document.scene.getState(), target))
					}
					onDrop={drop}
					label={(id) => findLayer(layers, id)?.name ?? id}
				>
					{layers.toReversed().map((layer) => (
						<LayerRow
							key={layer.id}
							layer={layer}
							depth={0}
							onSelect={select}
						/>
					))}
				</TreeDrag>
			</ScrollArea>
		</section>
	);
}
