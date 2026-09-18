import { type Details, type EditorDocument, editLayer } from "@/core/document";
import { validateDetails } from "./model";

export function setDetails(
	document: EditorDocument,
	change: Partial<Details>,
	id: string,
) {
	validateDetails(change);
	editLayer(document, id, (layer) => {
		if (layer.kind !== "details") {
			throw Error("Select a Details layer.");
		}
		return { ...layer, details: { ...layer.details, ...change } };
	});
}
