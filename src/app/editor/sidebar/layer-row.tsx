import { type ComponentProps, useState } from "react";
import { moveLayer, removeLayer, setLayer } from "@/app/document/edits";
import { useDocument } from "@/app/document/provider";
import type { ImageLayer } from "@/app/scene";
import { LayerThumbnail } from "./layer-thumbnail";

function focusName(input: HTMLInputElement | null) {
	input?.focus();
	input?.select();
}

function LayerName({
	layer,
	selected,
}: {
	layer: ImageLayer;
	selected: boolean;
}) {
	const document = useDocument();
	const [draft, setDraft] = useState<string>();
	if (draft !== undefined) {
		return (
			<input
				aria-label="Layer name"
				value={draft}
				ref={focusName}
				className="min-w-0 flex-1 rounded bg-neutral-950 px-2 py-1 text-sm outline-none ring-1 ring-neutral-500"
				onChange={(event) => setDraft(event.target.value)}
				onBlur={() => {
					if (draft.trim()) {
						setLayer(document, layer.id, { name: draft });
					}
					setDraft(undefined);
				}}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						event.currentTarget.blur();
					}
					if (event.key === "Escape") {
						setDraft(undefined);
					}
				}}
			/>
		);
	}
	return (
		<button
			type="button"
			aria-label={`Select ${layer.name}`}
			aria-pressed={selected}
			title="Double-click to rename"
			className="min-w-0 flex-1 truncate py-2 text-left text-xs outline-none focus-visible:underline"
			onClick={() => document.selectLayer(layer.id)}
			onDoubleClick={() => setDraft(layer.name)}
		>
			{layer.name}
		</button>
	);
}

export function LayerRow({
	layer,
	selected,
	index,
	count,
	...props
}: {
	layer: ImageLayer;
	selected: boolean;
	index: number;
	count: number;
} & ComponentProps<"li">) {
	const document = useDocument();
	const visibility = layer.visible
		? `Hide ${layer.name}`
		: `Show ${layer.name}`;
	return (
		<li
			{...props}
			data-selected={selected}
			data-visible={layer.visible}
			className="group relative flex items-center gap-2 rounded border border-transparent px-1.5 py-1 text-neutral-400 hover:bg-white/5 data-[selected=true]:border-white/5 data-[selected=true]:bg-white/[0.07] data-[selected=true]:text-neutral-100 before:pointer-events-none before:absolute before:inset-x-0 before:h-0.5 before:bg-neutral-200 data-[drop=above]:before:-top-0.5 data-[drop=below]:before:-bottom-0.5 data-[drop=none]:before:hidden"
			onKeyDown={(event) => {
				if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) {
					return;
				}
				event.preventDefault();
				moveLayer(
					document,
					layer.id,
					Math.max(
						0,
						Math.min(count - 1, index + (event.key === "ArrowUp" ? 1 : -1)),
					),
				);
			}}
		>
			<button
				type="button"
				aria-label={visibility}
				aria-pressed={layer.visible}
				title={visibility}
				className="shrink-0 rounded p-1 text-neutral-500 hover:text-neutral-100 aria-pressed:text-neutral-300 focus-visible:outline focus-visible:outline-neutral-400"
				onClick={() =>
					setLayer(document, layer.id, { visible: !layer.visible })
				}
			>
				<svg
					aria-hidden="true"
					viewBox="0 0 20 20"
					className="size-4"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.4"
				>
					<path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z" />
					<circle cx="10" cy="10" r="2" />
					{!layer.visible && <path d="m3 3 14 14" />}
				</svg>
			</button>
			<div className="shrink-0 opacity-100 group-data-[visible=false]:opacity-40">
				<LayerThumbnail image={document.resources.get(layer.source).image} />
			</div>
			<LayerName layer={layer} selected={selected} />
			<button
				type="button"
				aria-label={`Delete ${layer.name}`}
				title="Delete layer"
				className="rounded p-1 text-neutral-500 opacity-0 hover:text-neutral-100 focus-visible:opacity-100 group-hover:opacity-100 group-data-[selected=true]:opacity-100"
				onClick={() => removeLayer(document, layer.id)}
			>
				<svg
					aria-hidden="true"
					viewBox="0 0 20 20"
					className="size-3.5"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.4"
				>
					<path d="M3 5h14M8 2h4l1 3H7l1-3ZM5 5l1 12h8l1-12M8 8v6m4-6v6" />
				</svg>
			</button>
		</li>
	);
}
