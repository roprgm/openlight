import type { EditorDocument } from "@/app/document";
import { setGeometry } from "@/app/document/edits";
import type { Geometry } from "@/features/crop/geometry";

export function beginCrop(document: EditorDocument) {
	document.history.commit();
	const scene = document.scene.getState();
	document.preview.setState({
		comparison: "edited",
		crop: {
			geometry: { ...scene.geometry },
			aspect: scene.size[0] / scene.size[1],
		},
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
