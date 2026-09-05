import { useState } from "react";
import { moveLayer } from "@/app/document/edits";
import {
	useDocument,
	useScene,
	useSelectedLayer,
} from "@/app/document/provider";
import { LayerRow } from "./layer-row";

/** Keep drag feedback local; dropping commits one change to the document. */
export function LayerList() {
	const document = useDocument();
	const layers = useScene((scene) => scene.layers);
	const selected = useSelectedLayer();
	const [dragging, setDragging] = useState<string>();
	const [drop, setDrop] = useState<{ id: string; above: boolean }>();
	return (
		<ul className="min-h-0 space-y-1 overflow-y-auto py-1">
			{layers.toReversed().map((layer, row) => {
				const edge = drop?.above ? "above" : "below";
				const marker = drop?.id === layer.id ? edge : "none";
				return (
					<LayerRow
						key={layer.id}
						layer={layer}
						selected={selected?.id === layer.id}
						index={layers.length - row - 1}
						count={layers.length}
						draggable
						data-drop={marker}
						onDragStart={(event) => {
							if (event.target instanceof HTMLInputElement) {
								event.preventDefault();
								return;
							}
							event.dataTransfer.effectAllowed = "move";
							event.dataTransfer.setData(
								"application/x-openlight-layer",
								layer.id,
							);
							setDragging(layer.id);
						}}
						onDragOver={(event) => {
							if (!dragging) {
								return;
							}
							event.preventDefault();
							event.stopPropagation();
							event.dataTransfer.dropEffect = "move";
							const bounds = event.currentTarget.getBoundingClientRect();
							setDrop({
								id: layer.id,
								above: event.clientY < bounds.y + bounds.height / 2,
							});
						}}
						onDrop={(event) => {
							if (!dragging || !drop) {
								return;
							}
							event.preventDefault();
							event.stopPropagation();
							const from = layers.findIndex((layer) => layer.id === dragging);
							const boundary = layers.length - row - 1 + Number(drop.above);
							moveLayer(document, dragging, boundary - Number(from < boundary));
							setDragging(undefined);
							setDrop(undefined);
						}}
						onDragEnd={() => {
							setDragging(undefined);
							setDrop(undefined);
						}}
					/>
				);
			})}
		</ul>
	);
}
