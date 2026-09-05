import type { EditorDocument } from "@/app/document";
import { setGeometry } from "@/app/document/edits";
import type { Geometry } from "@/features/crop/geometry";

export function beginCrop(document: EditorDocument) {
	document.history.commit();
	document.preview.setState({
		comparison: "edited",
		crop: { geometry: { ...document.scene.getState().geometry }, aspect: null },
	});
}

export function updateCrop(
	document: EditorDocument,
	change: Partial<Geometry>,
	aspect = document.preview.getState().crop?.aspect ?? null,
) {
	const crop = document.preview.getState().crop;
	if (crop) {
		document.preview.setState({
			crop: { geometry: { ...crop.geometry, ...change }, aspect },
		});
	}
}

export function applyCrop(document: EditorDocument) {
	const crop = document.preview.getState().crop;
	if (crop) {
		setGeometry(document, crop.geometry);
	}
	document.preview.setState({ crop: null });
}

export function cancelCrop(document: EditorDocument) {
	document.preview.setState({ crop: null });
}
