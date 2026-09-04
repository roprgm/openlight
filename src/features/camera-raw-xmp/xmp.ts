const cameraRaw = "http://ns.adobe.com/camera-raw-settings/1.0/";
const rdf = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";

export type CameraRawXmp = {
	exposure2012?: number;
	contrast2012?: number;
	vibrance?: number;
	saturation?: number;
};

const attributes = {
	Exposure2012: "exposure2012",
	Contrast2012: "contrast2012",
	Vibrance: "vibrance",
	Saturation: "saturation",
} as const satisfies Record<string, keyof CameraRawXmp>;

export function isCameraRawXmp(file: File) {
	return /\.(xmp|xml)$/i.test(file.name);
}

export function readCameraRawXmp(text: string): CameraRawXmp {
	const document = new DOMParser().parseFromString(text, "application/xml");
	const description = document.getElementsByTagNameNS(rdf, "Description")[0];
	if (!description) {
		return {};
	}
	return Object.fromEntries(
		Object.entries(attributes).flatMap(([attribute, setting]) => {
			const raw = description.getAttributeNS(cameraRaw, attribute);
			if (raw === null || raw.trim() === "") {
				return [];
			}
			const value = Number(raw);
			return Number.isFinite(value) ? [[setting, value]] : [];
		}),
	);
}
