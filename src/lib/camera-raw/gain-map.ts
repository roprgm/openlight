/** DNG 1.6 ProfileGainTableMap: a spatial grid of one-dimensional gain tables. */
export type GainMap = {
	points: number[];
	spacing: number[];
	origin: number[];
	weights: number[];
	values: Float32Array<ArrayBuffer>;
};

/** Tag 52525 uses the TIFF byte order, including its packed floating-point fields. */
export function readGainMap(bytes: Uint8Array, littleEndian: boolean): GainMap {
	const invalid = () => Error("Invalid DNG profile gain table map.");
	if (bytes.byteLength < 64) throw invalid();
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const points = [4, 0, 40].map((at) => view.getUint32(at, littleEndian));
	const spacing = [16, 8].map((at) => view.getFloat64(at, littleEndian));
	const origin = [32, 24].map((at) => view.getFloat64(at, littleEndian));
	const weights = [44, 48, 52, 56, 60].map((at) =>
		view.getFloat32(at, littleEndian),
	);
	const count = points.reduce((a, b) => a * b, 1);
	if (
		points.some((v) => v < 1) ||
		64 + count * 4 !== bytes.byteLength ||
		spacing.some((v) => !Number.isFinite(v) || v <= 0) ||
		![...origin, ...weights].every(Number.isFinite)
	)
		throw invalid();
	const values = Float32Array.from({ length: count }, (_, i) =>
		view.getFloat32(64 + i * 4, littleEndian),
	);
	if (values.some((v) => !Number.isFinite(v) || v < 0)) throw invalid();
	return { points, spacing, origin, weights, values };
}
