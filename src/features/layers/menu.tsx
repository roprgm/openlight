import { cva } from "class-variance-authority";
import { type ReactNode, useId, useRef } from "react";
import { useDocument, useScene } from "@/components/editor/session";
import { Icon } from "@/components/icons/icon";
import { findLayer, type Layer, type ProcessingLayer } from "@/core/document";
import { deleteLayer, duplicateLayer, moveLayer } from "./edits";

const trigger = cva(
	"grid shrink-0 place-items-center text-neutral-400 hover:text-neutral-100",
	{
		variants: {
			variant: {
				row: "size-7 rounded hover:bg-neutral-600/40 pointer-coarse:size-10",
				pill: "h-7 rounded-full px-2.5 hover:bg-white/10 pointer-coarse:h-9",
			},
		},
	},
);

export function LayerMenu({
	label,
	children,
	icon,
	variant = "row",
}: {
	label: string;
	children: ReactNode;
	icon: ReactNode;
	variant?: "row" | "pill";
}) {
	const id = useId();
	const popover = useRef<HTMLDivElement>(null);
	return (
		<>
			<button
				type="button"
				aria-label={label}
				title={label}
				popoverTarget={id}
				className={trigger({ variant })}
			>
				{icon}
			</button>
			<div
				id={id}
				ref={popover}
				popover="auto"
				className="fixed inset-auto z-50 m-0 [position-area:bottom_span-left] max-h-[calc(100dvh-1rem)] min-w-40 overflow-y-auto rounded-md [position-try-fallbacks:flip-block] border border-neutral-600 bg-neutral-800 p-1 text-neutral-200 text-sm shadow-xl [&_button]:block [&_button]:w-full [&_button]:rounded [&_button]:px-2 [&_button]:py-1.5 [&_button]:text-left [&_button:hover]:bg-neutral-700 [&_button:disabled]:text-neutral-600"
			>
				<form
					onSubmit={(event) => {
						event.preventDefault();
						popover.current?.hidePopover();
					}}
				>
					{children}
				</form>
			</div>
		</>
	);
}

export function LayerActions({
	layer,
	siblings,
	parent,
	onSelect,
}: {
	layer: ProcessingLayer;
	siblings: readonly Layer[];
	parent?: Layer;
	onSelect: (id: string) => void;
}) {
	const document = useDocument();
	const layers = useScene((scene) => scene.layers);
	const index = siblings.findIndex((item) => item.id === layer.id);
	const containers = layers.filter(
		(item) =>
			layer.children.length === 0 &&
			item.kind !== "image" &&
			item.id !== parent?.id &&
			!findLayer([layer], item.id),
	);
	const bottom = !parent ? 1 : 0;
	function moveOut() {
		if (!parent) {
			return;
		}
		const index = layers.findIndex((item) => item.id === parent.id);
		moveLayer(document, layer.id, index + 1);
	}
	return (
		<LayerMenu
			label={`${layer.name} actions`}
			icon={
				<Icon className="size-4">
					<path
						d="M5 12h.01M12 12h.01M19 12h.01"
						strokeWidth="3"
						strokeLinecap="round"
					/>
				</Icon>
			}
		>
			<button
				type="submit"
				disabled={index === siblings.length - 1}
				onClick={() => moveLayer(document, layer.id, index + 1, parent?.id)}
			>
				Move up
			</button>
			<button
				type="submit"
				disabled={index === bottom}
				onClick={() => moveLayer(document, layer.id, index - 1, parent?.id)}
			>
				Move down
			</button>
			{parent && (
				<button type="submit" onClick={moveOut}>
					Move out
				</button>
			)}
			{containers.length > 0 && (
				<label className="flex items-center justify-between gap-3 px-2 py-1.5">
					Move into
					<select
						aria-label={`Move ${layer.name} into`}
						value=""
						className="min-w-0 max-w-32 bg-neutral-800"
						onChange={(event) => {
							const target = findLayer(layers, event.target.value);
							if (target) {
								moveLayer(
									document,
									layer.id,
									target.children.length,
									target.id,
								);
							}
						}}
					>
						<option value="" disabled>
							Choose layer
						</option>
						{containers.map((item) => (
							<option key={item.id} value={item.id}>
								{item.name}
							</option>
						))}
					</select>
				</label>
			)}
			<div className="my-1 border-t border-neutral-700" />
			<button
				type="submit"
				onClick={() => onSelect(duplicateLayer(document, layer.id))}
			>
				Duplicate
			</button>
			<button type="submit" onClick={() => deleteLayer(document, layer.id)}>
				Delete
			</button>
		</LayerMenu>
	);
}
